import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type SessionMode = "main" | "per-peer" | "per-channel" | "per-account-channel";

export interface Session {
  id: string;
  chatId: number;
  userId: string;
  username?: string;
  mode: SessionMode;
  createdAt: number;
  lastActive: number;
  messageCount: number;
  context: Array<{ role: "user" | "assistant"; content: string }>;
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = join(configManager.getWorkspacePath(), "sessions");
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
    this.loadSessions();
  }

  private loadSessions(): void {
    if (!existsSync(this.sessionsDir)) return;
    
    const files = readdirSync(this.sessionsDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(content) as Session;
        this.sessions.set(session.id, session);
      } catch (e) {
        console.warn(`Failed to load session ${file}:`, e);
      }
    }
  }

  private getSessionMode(): SessionMode {
    const config = configManager.load();
    return config.session?.mode || "main";
  }

  private generateSessionId(chatId: number, userId: string): string {
    const mode = this.getSessionMode();
    const timestamp = Date.now();
    
    switch (mode) {
      case "per-peer":
        return `peer_${userId}`;
      case "per-channel":
        return `channel_${chatId}`;
      case "per-account-channel":
        return `account_${chatId}_${userId}`;
      case "main":
      default:
        return "main";
    }
  }

  getOrCreateSession(chatId: number, userId: string, username?: string): Session {
    const sessionId = this.generateSessionId(chatId, userId);
    
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        id: sessionId,
        chatId,
        userId,
        username,
        mode: this.getSessionMode(),
        createdAt: Date.now(),
        lastActive: Date.now(),
        messageCount: 0,
        context: []
      };
      this.sessions.set(sessionId, session);
      this.saveSession(session);
    }

    session.lastActive = Date.now();
    return session;
  }

  addMessage(sessionId: string, role: "user" | "assistant", content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.context.push({ role, content });
    session.messageCount++;

    const maxContext = configManager.load().session?.maxContextMessages || 40;
    if (session.context.length > maxContext) {
      session.context = session.context.slice(-maxContext);
    }

    this.saveSession(session);
  }

  getContext(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
    const session = this.sessions.get(sessionId);
    return session?.context || [];
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context = [];
      session.messageCount = 0;
      this.saveSession(session);
    }
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.lastActive - a.lastActive);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    const filePath = join(this.sessionsDir, `${sessionId}.json`);
    const { unlinkSync } = require("node:fs");
    try {
      unlinkSync(filePath);
    } catch {}
  }

  private saveSession(session: Session): void {
    const filePath = join(this.sessionsDir, `${session.id}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActive > maxAge) {
        this.deleteSession(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const sessionManager = new SessionManager();
