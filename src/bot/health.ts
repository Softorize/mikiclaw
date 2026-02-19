import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { configManager } from "../config/manager.js";
import { logger } from "../utils/logger.js";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    config: { status: "ok" | "error"; message?: string };
    telegram: { status: "ok" | "error"; message?: string };
    ai: { status: "ok" | "error"; message?: string };
    workspace: { status: "ok" | "error"; message?: string };
    encryption: { status: "ok" | "error"; message?: string };
  };
}

interface HealthConfig {
  port: number;
  bindAddress: string;
  authToken?: string;
  allowLocalhost: boolean;
}

class HealthServer {
  private server: ReturnType<typeof createServer> | null = null;
  private startTime: number = Date.now();
  private config: HealthConfig = {
    port: 18790,
    bindAddress: "127.0.0.1", // Only bind to localhost by default
    authToken: randomBytes(32).toString("hex"), // Generate random token on startup
    allowLocalhost: true
  };

  start(customConfig?: Partial<HealthConfig>): void {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Set security headers
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Cache-Control", "no-store");

      if (req.url === "/health" || req.url === "/") {
        this.handleHealthCheck(req, res);
      } else if (req.url === "/metrics") {
        this.handleMetrics(req, res);
      } else if (req.url === "/token") {
        // Endpoint to get the auth token (localhost only)
        this.handleTokenRequest(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      }
    });

    this.server.listen(this.config.port, this.config.bindAddress, () => {
      logger.info(`Health server running on ${this.config.bindAddress}:${this.config.port}`);
      console.log(`🏥 Health endpoint: http://${this.config.bindAddress}:${this.config.port}/health`);
      console.log(`🔑 Auth token: ${this.config.authToken} (use header: X-Auth-Token)`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info("Health server stopped");
    }
  }

  private authenticate(req: IncomingMessage): boolean {
    // Allow localhost without auth if configured
    const socket = req.socket;
    const remoteAddress = socket.remoteAddress;
    
    if (this.config.allowLocalhost && (remoteAddress === "127.0.0.1" || remoteAddress === "::1")) {
      return true;
    }

    // Check for auth token in header
    const authToken = req.headers["x-auth-token"] as string | undefined;
    
    if (!authToken || !this.config.authToken) {
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    const provided = Buffer.from(authToken, "utf8");
    const expected = Buffer.from(this.config.authToken, "utf8");
    
    if (provided.length !== expected.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < provided.length; i++) {
      result |= provided[i] ^ expected[i];
    }

    return result === 0;
  }

  private async handleHealthCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authenticate(req)) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": "X-Auth-Token"
      });
      res.end(JSON.stringify({ error: "Unauthorized. Provide X-Auth-Token header." }));
      return;
    }

    const health = await this.getHealthStatus();
    res.writeHead(health.status === "healthy" ? 200 : 503, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "null" // Disable CORS for security
    });
    res.end(JSON.stringify(health, null, 2));
  }

  private handleMetrics(req: IncomingMessage, res: ServerResponse): void {
    if (!this.authenticate(req)) {
      res.writeHead(401, { 
        "Content-Type": "application/json",
        "WWW-Authenticate": "X-Auth-Token"
      });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    res.writeHead(200, { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "null"
    });
    res.end(JSON.stringify(this.getMetrics(), null, 2));
  }

  private handleTokenRequest(req: IncomingMessage, res: ServerResponse): void {
    // Only allow from localhost
    const socket = req.socket;
    const remoteAddress = socket.remoteAddress;
    
    if (remoteAddress !== "127.0.0.1" && remoteAddress !== "::1") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: localhost only" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      token: this.config.authToken,
      note: "Use this token in X-Auth-Token header for health/metrics endpoints"
    }));
  }

  private async getHealthStatus(): Promise<HealthStatus> {
    const checks = {
      config: this.checkConfig(),
      telegram: this.checkTelegram(),
      ai: this.checkAI(),
      workspace: await this.checkWorkspace(),
      encryption: this.checkEncryption()
    };

    const hasError = Object.values(checks).some(c => c.status === "error");
    const status = hasError ? "degraded" : "healthy";

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks
    };
  }

  private getMetrics() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    };
  }

  private checkConfig(): { status: "ok" | "error"; message?: string } {
    try {
      configManager.load();
      return { status: "ok" };
    } catch (e) {
      return { status: "error", message: String(e) };
    }
  }

  private checkTelegram(): { status: "ok" | "error"; message?: string } {
    const token = configManager.getTelegramToken();
    if (token) {
      return { status: "ok" };
    }
    return { status: "error", message: "No Telegram token configured" };
  }

  private checkAI(): { status: "ok" | "error"; message?: string } {
    const provider = configManager.getAIProvider();
    
    if (provider === "anthropic") {
      const key = configManager.getAnthropicKey();
      if (key) {
        return { status: "ok" };
      }
      return { status: "error", message: "No Anthropic API key configured" };
    }
    
    // For other providers, check their specific keys
    const config = configManager.load();
    if (provider === "kimi" && config.ai?.providers?.kimi?.apiKey) {
      return { status: "ok" };
    }
    if (provider === "minimax" && config.ai?.providers?.minimax?.apiKey) {
      return { status: "ok" };
    }
    
    return { status: "error", message: `No API key configured for ${provider}` };
  }

  private async checkWorkspace(): Promise<{ status: "ok" | "error"; message?: string }> {
    const path = configManager.getWorkspacePath();
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(path)) {
        return { status: "ok" };
      }
      return { status: "error", message: "Workspace not found" };
    } catch (e) {
      return { status: "error", message: String(e) };
    }
  }

  private checkEncryption(): { status: "ok" | "error"; message?: string } {
    try {
      const result = configManager.validateEncryption();
      if (result.valid) {
        return { status: "ok", message: result.message || "Encryption OK" };
      }
      return { status: "error", message: result.message || "Encryption validation failed" };
    } catch (e) {
      return { status: "error", message: String(e) };
    }
  }

  getAuthToken(): string {
    return this.config.authToken || "";
  }
}

export const healthServer = new HealthServer();
