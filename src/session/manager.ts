import { configManager } from "../config/manager.js";
import { memorySystem } from "../personality/memory.js";
import { conversationSummarizer } from "../ai/summarizer.js";
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
  summary?: string;           // Rolling summary of older conversation
  topics?: string[];          // Topics discussed in this session
  pendingSummarization?: boolean;  // Flag for async summarization
}

interface ConversationSummary {
  keyPoints: string[];
  topics: string[];
  userGoals: string[];
  nextActions: string[];
  emotionalTone: string;
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
        session.context = (session.context || []).filter(
          (msg) => !!msg && typeof msg.content === "string" && msg.content.trim().length > 0
        );
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
        context: [],
        summary: undefined,
        topics: [],
        pendingSummarization: false
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

    if (!content || content.trim().length === 0) {
      return;
    }

    session.context.push({ role, content });
    session.messageCount++;

    // Extract topics from user messages
    if (role === "user") {
      this.extractTopics(session, content);
    }

    const maxContext = configManager.load().session?.maxContextMessages || 40;
    const summarizationThreshold = maxContext + 10;

    // Check if we need to summarize
    if (session.context.length >= summarizationThreshold && !session.pendingSummarization) {
      this.summarizeAndArchive(session);
    }

    // Trim context if needed (keep summary + recent messages)
    if (session.context.length > maxContext) {
      // Keep the most recent messages
      session.context = session.context.slice(-maxContext);
    }

    this.saveSession(session);
  }

  /**
   * Extract topics from user message for session tracking
   */
  private extractTopics(session: Session, message: string): void {
    const topicPatterns = [
      /\b(JavaScript|TypeScript|Python|Rust|Go|Java|React|Node\.js|Docker|Kubernetes)\b/gi,
      /\b(project|app|website|code|program|feature)\b/gi,
      /\b(work|job|career|company|team|meeting)\b/gi,
      /\b(learn|study|course|book|tutorial|guide)\b/gi,
      /\b(problem|issue|bug|error|fix|debug)\b/gi,
      /\b(idea|plan|goal|task|todo|schedule)\b/gi
    ];

    for (const pattern of topicPatterns) {
      const matches = message.match(pattern);
      if (matches) {
        for (const match of matches) {
          const topic = match.toLowerCase();
          if (!session.topics?.includes(topic)) {
            session.topics = session.topics || [];
            session.topics.push(topic);
            // Keep only recent 10 topics
            if (session.topics.length > 10) {
              session.topics = session.topics.slice(-10);
            }
          }
        }
      }
    }
  }

  /**
   * Summarize old conversation and archive to memory
   * Uses AI for intelligent summarization
   */
  private async summarizeAndArchive(session: Session): Promise<void> {
    if (session.pendingSummarization) return;
    session.pendingSummarization = true;

    try {
      // Get the oldest messages that will be trimmed
      const messagesToSummarize = session.context.slice(0, session.context.length - 30);
      
      if (messagesToSummarize.length < 5) {
        session.pendingSummarization = false;
        return;
      }

      console.log(`📝 Summarizing ${messagesToSummarize.length} messages for session ${session.id}...`);

      // Try AI-powered summarization first
      let summary: string;
      let aiSummary = null;
      
      try {
        aiSummary = await conversationSummarizer.summarize(messagesToSummarize, {
          userId: session.userId
        });
      } catch (e) {
        console.warn("AI summarization failed, using fallback:", e);
      }

      if (aiSummary) {
        // Build rich summary from AI analysis
        const parts: string[] = [aiSummary.overview];
        
        if (aiSummary.keyPoints.length > 0) {
          parts.push(`Key points: ${aiSummary.keyPoints.join("; ")}`);
        }
        
        if (aiSummary.userGoals.length > 0) {
          parts.push(`Goals mentioned: ${aiSummary.userGoals.join("; ")}`);
        }
        
        if (aiSummary.actionItems.length > 0) {
          parts.push(`Action items: ${aiSummary.actionItems.join("; ")}`);
        }
        
        summary = parts.join(" | ");
        
        // Update session topics with AI-discovered topics
        if (aiSummary.topics.length > 0) {
          session.topics = [...new Set([...(session.topics || []), ...aiSummary.topics])].slice(-15);
        }

        // Store extracted facts as separate memories
        for (const fact of aiSummary.userPreferences) {
          memorySystem.addEntry({
            type: "preference",
            content: `User preference: ${fact}`,
            importance: 6,
            tags: ["preference", "ai_extracted"],
            userId: session.userId,
            source: "ai_summarization"
          });
        }

        for (const goal of aiSummary.userGoals) {
          memorySystem.addEntry({
            type: "goal",
            content: `User goal: ${goal}`,
            importance: 7,
            tags: ["goal", "ai_extracted"],
            userId: session.userId,
            source: "ai_summarization"
          });
        }

      } else {
        // Fallback to simple summary
        summary = this.createSimpleSummary(messagesToSummarize);
      }
      
      // Update session summary
      if (session.summary) {
        session.summary += `\n\n[Continued]\n${summary}`;
      } else {
        session.summary = summary;
      }

      // Archive to long-term memory with AI-enriched content
      const archiveContent = aiSummary 
        ? `Session summary: ${aiSummary.overview}. Topics: ${aiSummary.topics.join(", ")}. Tone: ${aiSummary.emotionalTone}.`
        : `Session ${session.id}: ${summary}`;

      memorySystem.addEntry({
        type: "conversation",
        content: archiveContent,
        importance: aiSummary ? 5 : 4,
        tags: ["conversation", "session_summary", "ai_enhanced", ...(session.topics || [])].slice(0, 10),
        userId: session.userId,
        source: "ai_summarization"
      });

      // Extract facts using AI if available
      try {
        const extractedFacts = await conversationSummarizer.extractFacts(messagesToSummarize);
        for (const fact of extractedFacts) {
          if (fact.confidence > 0.7) {
            memorySystem.addEntry({
              type: fact.type as any,
              content: fact.content,
              importance: Math.round(fact.confidence * 8),
              tags: [fact.type, "ai_extracted"],
              userId: session.userId,
              source: "ai_fact_extraction"
            });
          }
        }
      } catch (e) {
        // Fallback to manual fact extraction
        for (let i = 0; i < messagesToSummarize.length - 1; i++) {
          const userMsg = messagesToSummarize[i];
          const assistantMsg = messagesToSummarize[i + 1];
          
          if (userMsg.role === "user" && assistantMsg.role === "assistant") {
            memorySystem.extractUserFacts(session.userId, userMsg.content, assistantMsg.content);
          }
        }
      }

      // Trim the context
      session.context = session.context.slice(-30);
      
      console.log(`✅ Summarization complete for session ${session.id}`);
      
    } catch (e) {
      console.warn("Failed to summarize session:", e);
    } finally {
      session.pendingSummarization = false;
    }
  }

  /**
   * Create a simple summary of conversation messages
   */
  private createSimpleSummary(messages: Array<{ role: string; content: string }>): string {
    const userTopics = new Set<string>();
    const keyExchanges: string[] = [];
    
    for (let i = 0; i < messages.length; i += 2) {
      const userMsg = messages[i];
      const assistantMsg = messages[i + 1];
      
      if (userMsg && userMsg.role === "user") {
        // Extract first sentence or first 50 chars
        const preview = userMsg.content.split(/[.!?]/, 1)[0].slice(0, 50);
        if (preview.length > 10) {
          keyExchanges.push(preview);
        }
      }
    }

    // Limit exchanges in summary
    const limitedExchanges = keyExchanges.slice(-5);
    
    return `Discussed: ${limitedExchanges.join("; ")}`;
  }

  /**
   * Get enhanced context including summary for AI
   */
  getContext(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    // If we have a summary, prepend it as a system message context
    const context = session.context.filter((msg) => !!msg.content && msg.content.trim().length > 0);
    
    if (session.summary && context.length > 0) {
      // Add summary as context (first message)
      context.unshift({
        role: "assistant",
        content: `[Earlier conversation summary: ${session.summary.slice(0, 500)}]`
      });
    }

    return context;
  }

  /**
   * Get session metadata for context enrichment
   */
  getSessionMeta(sessionId: string): { 
    summary?: string; 
    topics: string[]; 
    messageCount: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      summary: session.summary,
      topics: session.topics || [],
      messageCount: session.messageCount
    };
  }

  clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Archive before clearing if there's content
      if (session.context.length > 5) {
        this.summarizeAndArchive(session);
      }
      
      session.context = [];
      session.messageCount = 0;
      session.summary = undefined;
      session.topics = [];
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
        // Archive before deleting
        if (session.context.length > 3) {
          this.summarizeAndArchive(session);
        }
        this.deleteSession(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const sessionManager = new SessionManager();
