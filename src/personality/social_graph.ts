import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Social Graph - Multi-User Relationship Tracking
 * 
 * Tracks relationships between users in group contexts:
 * - Who knows who
 * - Interaction patterns
 * - Shared interests
 * - Group dynamics
 */

export interface UserNode {
  userId: string;
  username?: string;
  firstSeen: string;
  lastActive: string;
  interactionCount: number;
  traits: {
    role?: "leader" | "contributor" | "observer" | "newcomer";
    activity: "high" | "medium" | "low";
    expertise: string[];
  };
}

export interface RelationshipEdge {
  userId1: string;
  userId2: string;
  strength: number;           // 0-10 relationship strength
  type: "friend" | "colleague" | "acquaintance" | "antagonist";
  interactions: number;
  sharedInterests: string[];
  lastInteraction: string;
  context: "group" | "direct" | "work";
}

export interface GroupContext {
  chatId: number;
  name?: string;
  members: string[];          // userIds
  topics: string[];
  dynamics: {
    cohesion: number;         // 0-10 how tight-knit
    activity: number;         // messages per day
    positivity: number;       // sentiment average
  };
  createdAt: string;
}

interface SocialGraphData {
  users: Map<string, UserNode>;
  relationships: RelationshipEdge[];
  groups: Map<string, GroupContext>;
}

class SocialGraph {
  private dataDir: string;
  private data: SocialGraphData;
  private dirty: boolean = false;

  constructor() {
    this.dataDir = join(configManager.getWorkspacePath(), "social_graph");
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.data = {
      users: new Map(),
      relationships: [],
      groups: new Map()
    };
    
    this.load();
  }

  private getDataPath(): string {
    return join(this.dataDir, "social_graph.json");
  }

  private load(): void {
    const dataPath = this.getDataPath();
    if (existsSync(dataPath)) {
      try {
        const content = readFileSync(dataPath, "utf-8");
        const parsed = JSON.parse(content);
        
        // Restore Maps
        this.data.users = new Map(parsed.users);
        this.data.relationships = parsed.relationships || [];
        this.data.groups = new Map(parsed.groups);
        
        console.log(`🕸️  Social graph loaded: ${this.data.users.size} users, ${this.data.relationships.length} relationships`);
      } catch (e) {
        console.warn("Failed to load social graph:", e);
      }
    }
  }

  save(): void {
    if (!this.dirty) return;
    
    try {
      const data = {
        users: Array.from(this.data.users.entries()),
        relationships: this.data.relationships,
        groups: Array.from(this.data.groups.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      writeFileSync(this.getDataPath(), JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (e) {
      console.warn("Failed to save social graph:", e);
    }
  }

  /**
   * Track user interaction in group context
   */
  trackInteraction(
    userId: string,
    chatId: number,
    options: {
      username?: string;
      mentions?: string[];      // Users mentioned in message
      sentiment?: number;       // -1 to 1
      topic?: string;
      isReply?: boolean;
      replyToUser?: string;
    } = {}
  ): void {
    const { username, mentions = [], sentiment = 0, topic, isReply, replyToUser } = options;
    const now = new Date().toISOString();

    // Update or create user node
    let user = this.data.users.get(userId);
    if (!user) {
      user = {
        userId,
        username,
        firstSeen: now,
        lastActive: now,
        interactionCount: 0,
        traits: {
          activity: "medium",
          expertise: []
        }
      };
      this.data.users.set(userId, user);
    }

    user.lastActive = now;
    user.interactionCount++;
    if (username && !user.username) {
      user.username = username;
    }

    // Update activity level
    if (user.interactionCount > 50) {
      user.traits.activity = "high";
    } else if (user.interactionCount < 10) {
      user.traits.activity = "low";
    }

    // Track relationships from mentions
    for (const mentionedId of mentions) {
      if (mentionedId !== userId) {
        this.updateRelationship(userId, mentionedId, {
          context: "group",
          interaction: "mention"
        });
      }
    }

    // Track reply relationships
    if (isReply && replyToUser && replyToUser !== userId) {
      this.updateRelationship(userId, replyToUser, {
        context: "group",
        interaction: "reply"
      });
    }

    // Update group context
    this.updateGroupContext(chatId, userId, topic, sentiment);

    this.dirty = true;
    
    // Save periodically (not on every interaction)
    if (user.interactionCount % 10 === 0) {
      this.save();
    }
  }

  /**
   * Update relationship between two users
   */
  private updateRelationship(
    userId1: string,
    userId2: string,
    options: {
      context: "group" | "direct" | "work";
      interaction: "mention" | "reply" | "collaboration" | "conflict";
    }
  ): void {
    const { context, interaction } = options;
    
    // Find existing relationship
    let rel = this.data.relationships.find(
      r => (r.userId1 === userId1 && r.userId2 === userId2) ||
           (r.userId1 === userId2 && r.userId2 === userId1)
    );

    if (!rel) {
      rel = {
        userId1,
        userId2,
        strength: 0,
        type: "acquaintance",
        interactions: 0,
        sharedInterests: [],
        lastInteraction: new Date().toISOString(),
        context
      };
      this.data.relationships.push(rel);
    }

    // Update relationship
    rel.interactions++;
    rel.lastInteraction = new Date().toISOString();

    // Adjust strength based on interaction type
    switch (interaction) {
      case "reply":
        rel.strength = Math.min(10, rel.strength + 0.5);
        break;
      case "mention":
        rel.strength = Math.min(10, rel.strength + 0.3);
        break;
      case "collaboration":
        rel.strength = Math.min(10, rel.strength + 1);
        rel.type = "colleague";
        break;
      case "conflict":
        rel.strength = Math.max(0, rel.strength - 1);
        rel.type = "antagonist";
        break;
    }

    // Update relationship type based on strength
    if (rel.strength > 7 && rel.type !== "antagonist") {
      rel.type = "friend";
    } else if (rel.strength > 4 && rel.type === "acquaintance") {
      rel.type = "colleague";
    }

    this.dirty = true;
  }

  /**
   * Update group context
   */
  private updateGroupContext(
    chatId: number,
    userId: string,
    topic?: string,
    sentiment: number = 0
  ): void {
    const chatIdStr = String(chatId);
    let group = this.data.groups.get(chatIdStr);

    if (!group) {
      group = {
        chatId,
        members: [],
        topics: [],
        dynamics: {
          cohesion: 5,
          activity: 0,
          positivity: 0
        },
        createdAt: new Date().toISOString()
      };
      this.data.groups.set(chatIdStr, group);
    }

    // Add member if not present
    if (!group.members.includes(userId)) {
      group.members.push(userId);
    }

    // Add topic
    if (topic && !group.topics.includes(topic)) {
      group.topics.push(topic);
      if (group.topics.length > 20) {
        group.topics = group.topics.slice(-20);
      }
    }

    // Update dynamics
    group.dynamics.positivity = (group.dynamics.positivity * 0.9) + (sentiment * 0.1);
    
    // Cohesion increases with member count up to a point
    const idealSize = 8;
    const sizeFactor = Math.max(0, 1 - Math.abs(group.members.length - idealSize) / idealSize);
    group.dynamics.cohesion = 5 + (sizeFactor * 5);

    this.dirty = true;
  }

  /**
   * Get user's relationships
   */
  getUserRelationships(userId: string): {
    friends: string[];
    colleagues: string[];
    acquaintances: string[];
    closeConnections: string[];
  } {
    const rels = this.data.relationships.filter(
      r => r.userId1 === userId || r.userId2 === userId
    );

    return {
      friends: rels.filter(r => r.type === "friend").map(r => r.userId1 === userId ? r.userId2 : r.userId1),
      colleagues: rels.filter(r => r.type === "colleague").map(r => r.userId1 === userId ? r.userId2 : r.userId1),
      acquaintances: rels.filter(r => r.type === "acquaintance").map(r => r.userId1 === userId ? r.userId2 : r.userId1),
      closeConnections: rels.filter(r => r.strength > 6).map(r => r.userId1 === userId ? r.userId2 : r.userId1)
    };
  }

  /**
   * Get group context for a chat
   */
  getGroupContext(chatId: number): GroupContext | null {
    return this.data.groups.get(String(chatId)) || null;
  }

  /**
   * Get social context for system prompt
   */
  getSocialContext(userId: string, chatId: number): string {
    const parts: string[] = [];
    
    // User's role in the group
    const group = this.data.groups.get(String(chatId));
    if (group) {
      const memberIndex = group.members.indexOf(userId);
      if (memberIndex >= 0) {
        const user = this.data.users.get(userId);
        if (user) {
          parts.push(`You know this user as ${user.username || userId} (${user.traits.activity} activity, ${user.interactionCount} interactions)`);
        }
      }

      // Group info
      parts.push(`Group has ${group.members.length} members, topics: ${group.topics.slice(-5).join(", ") || "general chat"}`);
    }

    // User's connections
    const relationships = this.getUserRelationships(userId);
    if (relationships.closeConnections.length > 0) {
      const names = relationships.closeConnections
        .map(id => this.data.users.get(id)?.username || id)
        .slice(0, 3);
      parts.push(`User is close with: ${names.join(", ")}`);
    }

    return parts.join("\n");
  }

  /**
   * Get shared context between users
   */
  getSharedContext(userId1: string, userId2: string): {
    relationship: RelationshipEdge | null;
    commonInterests: string[];
    interactionHistory: string;
  } {
    const rel = this.data.relationships.find(
      r => (r.userId1 === userId1 && r.userId2 === userId2) ||
           (r.userId1 === userId2 && r.userId2 === userId1)
    ) || null;

    // Find common groups
    const groups1 = Array.from(this.data.groups.values()).filter(g => g.members.includes(userId1));
    const groups2 = Array.from(this.data.groups.values()).filter(g => g.members.includes(userId2));
    const commonGroups = groups1.filter(g1 => groups2.some(g2 => g1.chatId === g2.chatId));

    return {
      relationship: rel,
      commonInterests: rel?.sharedInterests || [],
      interactionHistory: rel 
        ? `Have interacted ${rel.interactions} times, relationship: ${rel.type} (strength: ${rel.strength.toFixed(1)}/10)`
        : "No prior interactions recorded"
    };
  }

  /**
   * Detect group dynamics issues
   */
  detectIssues(chatId: number): string[] {
    const issues: string[] = [];
    const group = this.data.groups.get(String(chatId));
    
    if (!group) return issues;

    // Check for low positivity
    if (group.dynamics.positivity < -0.3) {
      issues.push("Group sentiment is negative");
    }

    // Check for exclusion
    const recentInteractions = this.data.relationships.filter(
      r => this.data.groups.get(String(chatId))?.members.includes(r.userId1) &&
           this.data.groups.get(String(chatId))?.members.includes(r.userId2)
    );
    
    const isolatedUsers = group.members.filter(member => {
      const interactions = recentInteractions.filter(
        r => r.userId1 === member || r.userId2 === member
      );
      return interactions.length === 0;
    });

    if (isolatedUsers.length > 0) {
      issues.push(`${isolatedUsers.length} members may be feeling isolated`);
    }

    return issues;
  }

  /**
   * Get statistics for debugging
   */
  getStats(): object {
    return {
      users: this.data.users.size,
      relationships: this.data.relationships.length,
      groups: this.data.groups.size,
      avgRelationshipStrength: this.data.relationships.reduce((sum, r) => sum + r.strength, 0) / 
        (this.data.relationships.length || 1)
    };
  }

  /**
   * Clean up old data
   */
  cleanup(maxAge: number = 90 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    
    // Remove old inactive users
    for (const [userId, user] of this.data.users.entries()) {
      const lastActive = new Date(user.lastActive).getTime();
      if (now - lastActive > maxAge) {
        this.data.users.delete(userId);
        // Remove their relationships
        this.data.relationships = this.data.relationships.filter(
          r => r.userId1 !== userId && r.userId2 !== userId
        );
      }
    }

    this.dirty = true;
    this.save();
  }
}

export const socialGraph = new SocialGraph();
