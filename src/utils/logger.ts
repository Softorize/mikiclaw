import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getMikiclawDir } from "./paths.js";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private logPath: string;
  private stream: ReturnType<typeof createWriteStream> | null = null;
  private minLevel: LogLevel = "info";

  constructor() {
    const logDir = join(getMikiclawDir(), "logs");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const date = new Date().toISOString().split("T")[0];
    this.logPath = join(logDir, `mikiclaw-${date}.log`);
    this.stream = createWriteStream(this.logPath, { flags: "a" });
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };
    return JSON.stringify(entry);
  }

  private write(entry: string): void {
    console.log(entry);
    if (this.stream) {
      this.stream.write(entry + "\n");
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      this.write(this.formatEntry("debug", message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      this.write(this.formatEntry("info", message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      this.write(this.formatEntry("warn", message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      this.write(this.formatEntry("error", message, context));
    }
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}

export const logger = new Logger();
