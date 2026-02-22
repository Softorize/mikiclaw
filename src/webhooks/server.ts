import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { configManager } from "../config/manager.js";
import { logger } from "../utils/logger.js";

export interface WebhookEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebhookEndpoint {
  path: string;
  url: string;
  method: "GET" | "POST";
  events: string[];
  secret?: string;
  allowedIps?: string[];
}

interface RequestWindow {
  count: number;
  resetAt: number;
}

class WebhookServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number = 18791;
  private requestWindows: Map<string, RequestWindow> = new Map();

  start(): void {
    const config = configManager.load();

    if (!config.webhooks?.enabled) {
      logger.info("Webhooks disabled");
      return;
    }

    this.port = config.webhooks?.port || 18791;

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res).catch((error) => {
        logger.error("Webhook request failed", { error: String(error) });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    });

    this.server.listen(this.port, () => {
      logger.info(`Webhook server running on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info("Webhook server stopped");
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const config = configManager.load();
    const url = new URL(req.url || "/", "http://localhost");
    const method = (req.method || "GET").toUpperCase() as "GET" | "POST";

    logger.info("Webhook received", { url: url.pathname, method });

    if (method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    const endpoints = config.webhooks?.endpoints || [];
    const matchingEndpoints = endpoints.filter(endpoint => endpoint.path === url.pathname && endpoint.method === method);

    if (matchingEndpoints.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No matching webhook endpoint" }));
      return;
    }

    const remoteIp = this.getRemoteIp(req);
    const rateLimit = config.webhooks?.rateLimitPerMinute || 60;
    if (!this.isWithinRateLimit(remoteIp, rateLimit)) {
      logger.warn("Webhook request rate limited", { remoteIp, rateLimit });
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many requests" }));
      return;
    }

    let data: Record<string, unknown>;
    let body = "";

    if (method === "POST") {
      const maxPayload = config.webhooks?.maxPayloadBytes || 1024 * 1024;
      try {
        body = await this.readBody(req, maxPayload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid payload";
        const statusCode = message.includes("Payload too large") ? 413 : 400;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
        return;
      }

      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Payload must be a JSON object");
        }
        data = parsed as Record<string, unknown>;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        return;
      }
    } else {
      data = Object.fromEntries(url.searchParams.entries());
      body = JSON.stringify(data);
    }

    const signatureHeader = req.headers["x-mikiclaw-signature"];
    const timestampHeader = req.headers["x-mikiclaw-timestamp"];

    let delivered = 0;

    for (const endpoint of matchingEndpoints) {
      if (!this.isIpAllowed(remoteIp, endpoint.allowedIps)) {
        logger.warn("Webhook IP rejected", { endpoint: endpoint.path, remoteIp });
        continue;
      }

      const secret = endpoint.secret || config.webhooks?.secret;
      if (!secret) {
        logger.warn("Webhook endpoint missing secret", { endpoint: endpoint.path });
        continue;
      }

      if (!this.verifySignature(body, signatureHeader, timestampHeader, secret)) {
        logger.warn("Webhook signature verification failed", { endpoint: endpoint.path, remoteIp });
        continue;
      }

      await this.processWebhook(endpoint, url.pathname, data);
      delivered++;
    }

    if (delivered === 0) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized webhook request" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, delivered }));
  }

  private async readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
    return await new Promise((resolve, reject) => {
      let body = "";
      let size = 0;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error("Payload too large"));
          req.destroy();
          return;
        }
        body += chunk.toString("utf-8");
      });

      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  private verifySignature(
    body: string,
    signatureHeader: string | string[] | undefined,
    timestampHeader: string | string[] | undefined,
    secret: string
  ): boolean {
    if (!signatureHeader || !timestampHeader) {
      return false;
    }

    const signatureValue = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const timestampValue = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    if (!signatureValue || !timestampValue) {
      return false;
    }

    const timestamp = Number(timestampValue);
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return false;
    }

    const payload = `${timestampValue}.${body}`;
    const expectedSignature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    const providedBuffer = Buffer.from(signatureValue);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }

  private isWithinRateLimit(ip: string, maxRequestsPerMinute: number): boolean {
    const now = Date.now();
    const current = this.requestWindows.get(ip);

    if (!current || now > current.resetAt) {
      this.requestWindows.set(ip, { count: 1, resetAt: now + 60000 });
      return true;
    }

    current.count += 1;
    return current.count <= maxRequestsPerMinute;
  }

  private isIpAllowed(ip: string, allowedIps?: string[]): boolean {
    if (!allowedIps || allowedIps.length === 0) {
      return true;
    }
    return allowedIps.includes(ip);
  }

  private getRemoteIp(req: IncomingMessage): string {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim();
    }

    const address = req.socket.remoteAddress || "unknown";
    return address.startsWith("::ffff:") ? address.slice(7) : address;
  }

  private async processWebhook(endpoint: WebhookEndpoint, path: string, data: Record<string, unknown>): Promise<void> {
    try {
      const event: WebhookEvent = {
        type: "webhook.trigger",
        timestamp: Date.now(),
        data: { path, ...data }
      };

      await this.sendToEndpoint(endpoint, event);
      logger.info("Webhook triggered", { path, endpoint: endpoint.url });
    } catch (error) {
      logger.error("Webhook send failed", { error: String(error), path });
    }
  }

  private async sendToEndpoint(endpoint: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    try {
      const body = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Mikiclaw-Event": event.type
      };

      if (endpoint.secret) {
        const payload = `${timestamp}.${body}`;
        headers["X-Mikiclaw-Timestamp"] = timestamp;
        headers["X-Mikiclaw-Signature"] = `sha256=${createHmac("sha256", endpoint.secret).update(payload).digest("hex")}`;
      }

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body
      });

      if (!response.ok) {
        logger.warn("Webhook endpoint returned non-2xx", { endpoint: endpoint.url, status: response.status });
      }
    } catch (error) {
      logger.error("Failed to send webhook", { error: String(error), url: endpoint.url });
    }
  }

  async triggerEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    const config = configManager.load();
    const endpoints = config.webhooks?.endpoints || [];

    for (const endpoint of endpoints) {
      if (endpoint.events.includes(eventType) || endpoint.events.includes("*")) {
        const event: WebhookEvent = {
          type: eventType,
          timestamp: Date.now(),
          data
        };
        await this.sendToEndpoint(endpoint, event);
      }
    }
  }
}

export const webhookServer = new WebhookServer();
