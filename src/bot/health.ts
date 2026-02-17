import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { configManager } from "../config/manager.js";
import { logger } from "../utils/logger.js";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    config: { status: "ok" | "error"; message?: string };
    telegram: { status: "ok" | "error"; message?: string };
    anthropic: { status: "ok" | "error"; message?: string };
    workspace: { status: "ok" | "error"; message?: string };
  };
}

class HealthServer {
  private server: ReturnType<typeof createServer> | null = null;
  private startTime: number = Date.now();
  private port: number = 18790;

  start(): void {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/health" || req.url === "/") {
        const health = this.getHealthStatus();
        res.writeHead(health.status === "healthy" ? 200 : 503, { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify(health, null, 2));
      } else if (req.url === "/metrics") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.getMetrics(), null, 2));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    this.server.listen(this.port, () => {
      logger.info(`Health server running on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info("Health server stopped");
    }
  }

  private getHealthStatus(): HealthStatus {
    const checks = {
      config: this.checkConfig(),
      telegram: this.checkTelegram(),
      anthropic: this.checkAnthropic(),
      workspace: this.checkWorkspace()
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
      nodeVersion: process.version
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

  private checkAnthropic(): { status: "ok" | "error"; message?: string } {
    const key = configManager.getAnthropicKey();
    if (key) {
      return { status: "ok" };
    }
    return { status: "error", message: "No Anthropic API key configured" };
  }

  private checkWorkspace(): { status: "ok" | "error"; message?: string } {
    const path = configManager.getWorkspacePath();
    try {
      const { existsSync } = require("node:fs");
      if (existsSync(path)) {
        return { status: "ok" };
      }
      return { status: "error", message: "Workspace not found" };
    } catch (e) {
      return { status: "error", message: String(e) };
    }
  }
}

export const healthServer = new HealthServer();
