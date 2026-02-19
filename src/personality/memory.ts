import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { UserProfiler } from "./user_profiler.js";

interface MemoryEntry {
  timestamp: string;
  type: "fact" | "preference" | "conversation" | "tool_usage" | "user_style" | "learning";
  content: string;
  importance: number;
  tags: string[];
  userId?: string;
}

const MAX_CONTENT_LENGTH = 10000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const VALID_TYPES = new Set(["fact", "preference", "conversation", "tool_usage", "user_style", "learning"]);

class MemorySystem {
  private memoryPath: string;
  private lastInteractionTime: number = Date.now();
  private memoryCache: MemoryEntry[] | null = null;
  private userProfilers: Map<string, UserProfiler> = new Map();

  constructor() {
    this.memoryPath = join(configManager.getWorkspacePath(), "MEMORY.md");
  }

  /**
   * Get or create user profiler
   */
  getUserProfiler(userId: string): UserProfiler {
    if (!this.userProfilers.has(userId)) {
      this.userProfilers.set(userId, new UserProfiler(userId));
    }
    return this.userProfilers.get(userId)!;
  }

  load(): MemoryEntry[] {
    if (this.memoryCache) {
      return this.memoryCache;
    }

    if (!existsSync(this.memoryPath)) {
      this.memoryCache = [];
      return [];
    }

    try {
      const content = readFileSync(this.memoryPath, "utf-8");
      this.memoryCache = this.parseMemoryFile(content);
      return this.memoryCache;
    } catch (e) {
      console.warn("Failed to load memory:", e);
      this.memoryCache = [];
      return [];
    }
  }

  save(entries: MemoryEntry[]): void {
    const workspacePath = configManager.getWorkspacePath();
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true });
    }

    const content = this.serializeMemory(entries);
    writeFileSync(this.memoryPath, content);
    this.memoryCache = entries;
  }

  addEntry(entry: Omit<MemoryEntry, "timestamp">): void {
    const entries = this.load();
    
    // Validate entry
    const validatedEntry = this.validateEntry(entry);
    if (!validatedEntry) {
      console.warn("Invalid memory entry rejected");
      return;
    }

    entries.push({
      ...validatedEntry,
      timestamp: new Date().toISOString()
    });

    if (entries.length > 1000) {
      entries.sort((a, b) => b.importance - a.importance);
      entries.splice(1000);
    }

    this.save(entries);
  }

  private validateEntry(entry: Omit<MemoryEntry, "timestamp">): MemoryEntry | null {
    // Validate type
    if (!VALID_TYPES.has(entry.type)) {
      return null;
    }

    // Validate content
    if (!entry.content || typeof entry.content !== "string") {
      return null;
    }

    // Truncate content if too long
    const content = entry.content.slice(0, MAX_CONTENT_LENGTH);

    // Sanitize content - remove potential YAML/Markdown injection
    const sanitizedContent = content
      .replace(/^---/gm, '')  // Remove YAML frontmatter markers
      .replace(/^\s*#/gm, '') // Remove markdown headers
      .replace(/`{3,}/g, '')  // Remove code fences
      .trim();

    // Validate importance
    const importance = Math.max(1, Math.min(10, entry.importance || 1));

    // Validate and sanitize tags
    const tags = (entry.tags || [])
      .slice(0, MAX_TAGS)
      .map(tag => String(tag).slice(0, MAX_TAG_LENGTH).replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter(tag => tag.length > 0);

    return {
      type: entry.type as MemoryEntry["type"],
      content: sanitizedContent,
      importance,
      tags,
      timestamp: "" // Will be set by caller
    };
  }

  search(query: string): MemoryEntry[] {
    const entries = this.load();
    const lowerQuery = query.toLowerCase().slice(0, 500); // Limit query length

    return entries.filter(entry =>
      entry.content.toLowerCase().includes(lowerQuery) ||
      entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  getRelevantContext(userMessage: string): string {
    const entries = this.load();
    const relevant = entries
      .filter(e => e.importance >= 5)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    if (relevant.length === 0) return "";

    return relevant.map(e => `- ${e.content}`).join("\n");
  }

  consolidateConversations(conversationSummary: string): void {
    // Sanitize summary before storing
    const sanitized = conversationSummary
      .slice(0, MAX_CONTENT_LENGTH)
      .replace(/^---/gm, '')
      .trim();

    this.addEntry({
      type: "conversation",
      content: sanitized,
      importance: 3,
      tags: ["conversation", "daily"]
    });
  }

  recordToolUsage(toolName: string, command: string): void {
    this.addEntry({
      type: "tool_usage",
      content: `Used ${toolName}: ${command.slice(0, 500)}`,
      importance: 2,
      tags: ["tool", toolName.slice(0, 50)]
    });
  }

  learnUserPreference(key: string, value: string): void {
    this.addEntry({
      type: "preference",
      content: `User prefers ${key.slice(0, 100)}: ${value.slice(0, 500)}`,
      importance: 7,
      tags: ["preference", key.slice(0, 50)]
    });
  }

  trackInteraction(chatId: number): void {
    this.lastInteractionTime = Date.now();
  }

  getIdleTime(): number {
    return Date.now() - this.lastInteractionTime;
  }

  clear(): void {
    this.memoryCache = [];
    this.save([]);
  }

  /**
   * Extract and store user facts from conversation
   */
  extractUserFacts(userId: string, userMessage: string, assistantResponse: string): void {
    // Extract name introductions
    const namePatterns = [
      /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+)/i,
      /(?:name is|I'm|I am)\s+([A-Z][a-z]+)/,
      /Hi,?\s+I'm\s+([A-Z][a-z]+)/i
    ];

    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const name = match[1];
        this.addEntry({
          type: "fact",
          content: `User's name is ${name}`,
          importance: 10,
          tags: ["name", "identity", userId],
          userId
        });
        break;
      }
    }

    // Extract location mentions
    const locationPatterns = [
      /(?:I live in|I'm from|I am from|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ];

    for (const pattern of locationPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const location = match[1];
        this.addEntry({
          type: "fact",
          content: `User lives in/is from ${location}`,
          importance: 8,
          tags: ["location", "identity", userId],
          userId
        });
        break;
      }
    }

    // Extract work/occupation
    const workPatterns = [
      /(?:I work as|I'm a|I am a|I work for)\s+([a-zA-Z\s]+)/i
    ];

    for (const pattern of workPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const work = match[1].trim();
        this.addEntry({
          type: "fact",
          content: `User works as ${work}`,
          importance: 8,
          tags: ["work", "occupation", userId],
          userId
        });
      }
    }

    // Extract preferences explicitly stated
    const preferencePatterns = [
      /(?:I like|I love|I prefer|I enjoy)\s+(.+)/i
    ];

    for (const pattern of preferencePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const preference = match[1].trim().slice(0, 100);
        this.addEntry({
          type: "preference",
          content: `User likes: ${preference}`,
          importance: 7,
          tags: ["preference", "interest", userId],
          userId
        });
      }
    }

    // Extract things user doesn't like
    const dislikePatterns = [
      /(?:I hate|I dislike|I don't like|I can't stand)\s+(.+)/i
    ];

    for (const pattern of dislikePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const dislike = match[1].trim().slice(0, 100);
        this.addEntry({
          type: "preference",
          content: `User dislikes: ${dislike}`,
          importance: 8,
          tags: ["preference", "dislike", userId],
          userId
        });
      }
    }
  }

  /**
   * Learn from user interaction - analyze and store patterns
   */
  learnFromInteraction(
    userId: string,
    userMessage: string,
    assistantResponse: string,
    toolsUsed?: string[]
  ): void {
    // Update user communication style profile
    const profiler = this.getUserProfiler(userId);
    profiler.analyzeMessage(userMessage);
    profiler.learnFromInteraction(userMessage, assistantResponse);

    // Store learning memory
    this.addEntry({
      type: "learning",
      content: `Interaction with ${userId}: "${userMessage.slice(0, 200)}"`,
      importance: 4,
      tags: ["interaction", "learning", userId],
      userId
    });

    // Detect and store user preferences from message
    this.detectAndStorePreferences(userId, userMessage);
  }

  /**
   * Detect user preferences from message content
   */
  private detectAndStorePreferences(userId: string, message: string): void {
    const profiler = this.getUserProfiler(userId);
    const profile = profiler.loadProfile();

    // Detect response length preference
    if (message.toLowerCase().includes("brief") || message.toLowerCase().includes("short") || message.toLowerCase().includes("quick")) {
      profile.style.responseLength = "short";
      profile.style.verbosity = Math.max(1, profile.style.verbosity - 1);
    }
    if (message.toLowerCase().includes("detailed") || message.toLowerCase().includes("explain") || message.toLowerCase().includes("elaborate")) {
      profile.style.responseLength = "long";
      profile.style.verbosity = Math.min(10, profile.style.verbosity + 1);
    }

    // Detect formality preference
    if (message.toLowerCase().includes("please") && message.toLowerCase().includes("thank")) {
      profile.style.greetingStyle = "professional";
    }
    if (message.toLowerCase().includes("hey") || message.toLowerCase().includes("yo")) {
      profile.style.greetingStyle = "casual";
    }

    // Detect technical preference
    if (message.toLowerCase().includes("eli5") || message.toLowerCase().includes("explain like i'm 5") || message.toLowerCase().includes("simple")) {
      profile.style.technicalLevel = Math.max(1, profile.style.technicalLevel - 2);
    }
    if (message.toLowerCase().includes("technical") || message.toLowerCase().includes("advanced")) {
      profile.style.technicalLevel = Math.min(10, profile.style.technicalLevel + 2);
    }

    profiler.saveProfile(profile);
  }

  /**
   * Get personalized context for AI based on user profile
   */
  getPersonalizedContext(userId: string, userMessage: string): string {
    const profiler = this.getUserProfiler(userId);
    const profile = profiler.loadProfile();

    const contextParts: string[] = [];

    // Get user's name from facts
    const entries = this.load();
    const userNameFact = entries.find(e =>
      e.userId === userId &&
      e.type === "fact" &&
      e.content.includes("name is")
    );

    if (userNameFact) {
      // Extract name from "User's name is John"
      const nameMatch = userNameFact.content.match(/name is\s+([A-Z][a-z]+)/i);
      if (nameMatch && nameMatch[1]) {
        contextParts.push(`# User Identity\nUser's name: ${nameMatch[1]}\nAlways address the user by their name when appropriate.`);
      }
    }

    // Add personality adjustments
    const personalityPrompt = profiler.getPersonalityPrompt();
    if (personalityPrompt) {
      contextParts.push("# User Communication Style\n" + personalityPrompt);
    }

    // Add interests context
    const interests = profiler.getInterestContext();
    if (interests) {
      contextParts.push(interests);
    }

    // Add relevant memories
    const relevantMemories = this.search(userMessage);
    if (relevantMemories.length > 0) {
      const memoryContext = relevantMemories
        .slice(0, 5)
        .map(m => `- ${m.content}`)
        .join("\n");
      contextParts.push("# Relevant Memories\n" + memoryContext);
    }

    // Add user facts
    const userFacts = entries
      .filter(m => m.userId === userId && m.type === "fact" && m.importance >= 5)
      .slice(0, 10)
      .map(m => `- ${m.content}`)
      .join("\n");
    if (userFacts) {
      contextParts.push("# User Facts\n" + userFacts);
    }

    // Add user preferences
    const userPrefs = entries
      .filter(m => m.userId === userId && m.type === "preference" && m.importance >= 5)
      .slice(0, 5)
      .map(m => `- ${m.content}`)
      .join("\n");
    if (userPrefs) {
      contextParts.push("# User Preferences\n" + userPrefs);
    }

    return contextParts.join("\n\n");
  }

  /**
   * Consolidate and compress old memories
   */
  consolidateMemories(): void {
    const entries = this.load();

    // Group by type and find patterns
    const conversations = entries.filter(e => e.type === "conversation");
    const learnings = entries.filter(e => e.type === "learning");

    // If too many conversations, summarize them
    if (conversations.length > 100) {
      // Keep only high importance conversations
      const kept = conversations
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 50);

      // Remove old low-importance conversations
      entries.splice(0, entries.length - kept.length);
    }

    // Decay importance of old entries over time
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryTime = new Date(entry.timestamp).getTime();
      const age = now - entryTime;

      if (age > thirtyDays) {
        // Reduce importance by 1 for each 30 days old
        const decay = Math.floor(age / thirtyDays);
        entry.importance = Math.max(1, entry.importance - decay);
      }
    }

    // Remove very low importance entries if too many
    if (entries.length > 1000) {
      entries.sort((a, b) => b.importance - a.importance);
      entries.splice(500);
    }

    this.save(entries);
  }

  private parseMemoryFile(content: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    
    // Split by markdown headers for entries
    const blocks = content.split(/^##\s+/m).filter(Boolean);

    for (const block of blocks) {
      try {
        const entry = this.parseEntryBlock(block);
        if (entry) {
          entries.push(entry);
        }
      } catch (e) {
        // Skip malformed entries
        console.warn("Skipping malformed memory entry");
      }
    }

    return entries;
  }

  private parseEntryBlock(block: string): MemoryEntry | null {
    const lines = block.split("\n");
    
    // First line should be the type
    const typeLine = lines[0]?.trim();
    const typeMatch = typeLine?.match(/^- type:\s*(\w+)/);
    
    if (!typeMatch || !VALID_TYPES.has(typeMatch[1])) {
      return null;
    }

    const type = typeMatch[1] as MemoryEntry["type"];

    // Parse other fields with safe regex patterns
    const contentMatch = block.match(/^- content:\s*(.+?)(?=\n-|$)/s);
    const importanceMatch = block.match(/^- importance:\s*(\d+)/);
    const tagsMatch = block.match(/^- tags:\s*\[([^\]]*)\]/);
    const timestampMatch = block.match(/^- timestamp:\s*(.+)/);

    // Validate and sanitize content
    let content = contentMatch?.[1]?.trim() || "";
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    // Validate importance
    const importance = importanceMatch 
      ? Math.max(1, Math.min(10, parseInt(importanceMatch[1], 10) || 1))
      : 1;

    // Parse and validate tags
    let tags: string[] = [];
    if (tagsMatch?.[1]) {
      tags = tagsMatch[1]
        .split(",")
        .map(t => t.trim().slice(0, MAX_TAG_LENGTH).replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(t => t.length > 0)
        .slice(0, MAX_TAGS);
    }

    // Validate timestamp
    let timestamp = timestampMatch?.[1]?.trim() || new Date().toISOString();
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        timestamp = new Date().toISOString();
      }
    } catch {
      timestamp = new Date().toISOString();
    }

    return { type, content, importance, tags, timestamp };
  }

  private serializeMemory(entries: MemoryEntry[]): string {
    let content = "# Memory\n\n";
    content += "Long-term memory for the agent.\n\n";

    const sorted = entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    for (const entry of sorted) {
      content += `## ${entry.type}\n`;
      content += `- timestamp: ${this.escapeValue(entry.timestamp)}\n`;
      content += `- type: ${entry.type}\n`;
      content += `- content: ${this.escapeValue(entry.content)}\n`;
      content += `- importance: ${entry.importance}\n`;
      content += `- tags: [${entry.tags.map(t => this.escapeValue(t)).join(", ")}]\n\n`;
    }

    return content;
  }

  private escapeValue(value: string): string {
    // Escape special YAML characters
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/^---/, '\\-\\-\\-');
  }
}

export const memorySystem = new MemorySystem();
