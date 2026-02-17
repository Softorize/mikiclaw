import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface MemoryEntry {
  timestamp: string;
  type: "fact" | "preference" | "conversation" | "tool_usage";
  content: string;
  importance: number;
  tags: string[];
}

class MemorySystem {
  private memoryPath: string;
  private lastInteractionTime: number = Date.now();

  constructor() {
    this.memoryPath = join(configManager.getWorkspacePath(), "MEMORY.md");
  }

  load(): MemoryEntry[] {
    if (!existsSync(this.memoryPath)) {
      return [];
    }

    try {
      const content = readFileSync(this.memoryPath, "utf-8");
      return this.parseMemoryFile(content);
    } catch (e) {
      console.warn("Failed to load memory:", e);
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
  }

  addEntry(entry: Omit<MemoryEntry, "timestamp">): void {
    const entries = this.load();
    entries.push({
      ...entry,
      timestamp: new Date().toISOString()
    });

    if (entries.length > 1000) {
      entries.sort((a, b) => b.importance - a.importance);
      entries.splice(1000);
    }

    this.save(entries);
  }

  search(query: string): MemoryEntry[] {
    const entries = this.load();
    const lowerQuery = query.toLowerCase();

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
    this.addEntry({
      type: "conversation",
      content: conversationSummary,
      importance: 3,
      tags: ["conversation", "daily"]
    });
  }

  recordToolUsage(toolName: string, command: string): void {
    this.addEntry({
      type: "tool_usage",
      content: `Used ${toolName}: ${command}`,
      importance: 2,
      tags: ["tool", toolName]
    });
  }

  learnUserPreference(key: string, value: string): void {
    this.addEntry({
      type: "preference",
      content: `User prefers ${key}: ${value}`,
      importance: 7,
      tags: ["preference", key]
    });
  }

  trackInteraction(chatId: number): void {
    this.lastInteractionTime = Date.now();
  }

  getIdleTime(): number {
    return Date.now() - this.lastInteractionTime;
  }

  private parseMemoryFile(content: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    const blocks = content.split(/^## /m).filter(Boolean);

    for (const block of blocks) {
      const lines = block.split("\n");
      const typeMatch = lines[0]?.match(/- type: (\w+)/);
      const contentMatch = lines.join("\n").match(/- content: (.+)/);
      const importanceMatch = lines.join("\n").match(/- importance: (\d+)/);
      const tagsMatch = lines.join("\n").match(/- tags: \[([^\]]+)\]/);
      const timestampMatch = lines.join("\n").match(/- timestamp: (.+)/);

      if (typeMatch && contentMatch) {
        entries.push({
          type: typeMatch[1] as MemoryEntry["type"],
          content: contentMatch[1].trim(),
          importance: importanceMatch ? parseInt(importanceMatch[1]) : 1,
          tags: tagsMatch ? tagsMatch[1].split(", ").map(t => t.trim()) : [],
          timestamp: timestampMatch ? timestampMatch[1].trim() : new Date().toISOString()
        });
      }
    }

    return entries;
  }

  private serializeMemory(entries: MemoryEntry[]): string {
    let content = "# Memory\n\n";
    content += "Long-term memory for the agent.\n\n";

    const sorted = entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    for (const entry of sorted) {
      content += `## ${entry.type}\n`;
      content += `- timestamp: ${entry.timestamp}\n`;
      content += `- type: ${entry.type}\n`;
      content += `- content: ${entry.content}\n`;
      content += `- importance: ${entry.importance}\n`;
      content += `- tags: [${entry.tags.join(", ")}]\n\n`;
    }

    return content;
  }
}

export const memorySystem = new MemorySystem();
