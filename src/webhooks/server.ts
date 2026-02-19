import { createServer, IncomingMessage, ServerResponse } from "node:http";
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
}

class WebhookServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number = 18791;

  start(): void {
    const config = configManager.load();
    
    if (!config.webhooks?.enabled) {
      logger.info("Webhooks disabled");
      return;
    }

    this.port = config.webhooks?.port || 18791;

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
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
    const url = req.url || "/";
    const method = req.method || "GET";

    logger.info("Webhook received", { url, method });

    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          await this.processWebhook(url, data);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          logger.error("Webhook error", { error: String(error) });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
      });
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  }

  private async processWebhook(path: string, data: Record<string, unknown>): Promise<void> {
    const config = configManager.load();
    const endpoints = config.webhooks?.endpoints || [];

    for (const endpoint of endpoints) {
      if (endpoint.path === path) {
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
    }
  }

  private async sendToEndpoint(endpoint: WebhookEndpoint, event: WebhookEvent): Promise<void> {
    try {
      await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mikiclaw-Event": event.type
        },
        body: JSON.stringify(event)
      });
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
