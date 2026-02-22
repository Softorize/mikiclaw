import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Long-Term Pattern Detection
 * 
 * Detects patterns in user behavior over time:
 * - Daily/weekly routines
 * - Mood patterns
 * - Topic cycles
 * - Activity spikes
 * - Behavioral changes
 */

export interface Pattern {
  id: string;
  userId: string;
  type: "routine" | "mood_cycle" | "topic_cluster" | "activity_spike" | "behavior_change";
  name: string;
  description: string;
  confidence: number;         // 0-1
  firstObserved: string;
  lastObserved: string;
  occurrences: number;
  schedule?: {
    type: "daily" | "weekly" | "monthly";
    timeOfDay?: number;       // 0-23 hour
    dayOfWeek?: number;       // 0-6 (Sun-Sat)
    dayOfMonth?: number;      // 1-31
  };
  metadata: Record<string, any>;
  active: boolean;
}

export interface PatternInsight {
  pattern: Pattern;
  relevance: number;          // How relevant to current context
  suggestion?: string;        // Actionable suggestion
}

interface ActivityWindow {
  timestamp: string;
  userId: string;
  type: "message" | "command" | "query";
  content?: string;
  sentiment?: number;
  topic?: string;
}

class PatternDetector {
  private patternsDir: string;
  private patterns: Map<string, Pattern> = new Map();
  private recentActivity: ActivityWindow[] = [];
  private maxActivityWindow = 1000; // Keep last 1000 activities

  constructor() {
    this.patternsDir = join(configManager.getWorkspacePath(), "patterns");
    if (!existsSync(this.patternsDir)) {
      mkdirSync(this.patternsDir, { recursive: true });
    }
    this.loadPatterns();
  }

  private getPatternsPath(userId: string): string {
    return join(this.patternsDir, `${userId}_patterns.json`);
  }

  private loadPatterns(): void {
    try {
      const files = readdirSync(this.patternsDir)
        .filter((f: string) => f.endsWith("_patterns.json"));
      
      for (const file of files) {
        try {
          const content = readFileSync(join(this.patternsDir, file), "utf-8");
          const patterns = JSON.parse(content) as Pattern[];
          for (const pattern of patterns) {
            this.patterns.set(pattern.id, pattern);
          }
        } catch (e) {
          console.warn(`Failed to load pattern file ${file}:`, e);
        }
      }
      
      console.log(`📊 Loaded ${this.patterns.size} patterns`);
    } catch (e) {
      console.warn("Failed to load patterns:", e);
    }
  }

  private savePatterns(userId: string): void {
    const userPatterns = Array.from(this.patterns.values())
      .filter(p => p.userId === userId);
    
    try {
      writeFileSync(
        this.getPatternsPath(userId),
        JSON.stringify(userPatterns, null, 2)
      );
    } catch (e) {
      console.warn(`Failed to save patterns for ${userId}:`, e);
    }
  }

  /**
   * Record user activity for pattern detection
   */
  recordActivity(
    userId: string,
    type: ActivityWindow["type"],
    options: {
      content?: string;
      sentiment?: number;
      topic?: string;
    } = {}
  ): void {
    const activity: ActivityWindow = {
      timestamp: new Date().toISOString(),
      userId,
      type,
      ...options
    };

    this.recentActivity.push(activity);
    
    // Keep window manageable
    if (this.recentActivity.length > this.maxActivityWindow) {
      this.recentActivity = this.recentActivity.slice(-this.maxActivityWindow);
    }

    // Trigger pattern detection periodically
    if (this.recentActivity.length % 20 === 0) {
      this.detectPatterns(userId);
    }
  }

  /**
   * Detect patterns for a user
   */
  detectPatterns(userId: string): Pattern[] {
    const userActivity = this.recentActivity.filter(a => a.userId === userId);
    if (userActivity.length < 10) return [];

    const newPatterns: Pattern[] = [];

    // 1. Detect daily routines
    const routinePattern = this.detectRoutine(userId, userActivity);
    if (routinePattern) {
      newPatterns.push(routinePattern);
    }

    // 2. Detect mood cycles
    const moodPattern = this.detectMoodCycle(userId, userActivity);
    if (moodPattern) {
      newPatterns.push(moodPattern);
    }

    // 3. Detect topic clusters
    const topicPatterns = this.detectTopicClusters(userId, userActivity);
    newPatterns.push(...topicPatterns);

    // 4. Detect activity spikes
    const spikePattern = this.detectActivitySpikes(userId, userActivity);
    if (spikePattern) {
      newPatterns.push(spikePattern);
    }

    // 5. Detect behavior changes
    const changePattern = this.detectBehaviorChange(userId, userActivity);
    if (changePattern) {
      newPatterns.push(changePattern);
    }

    // Store new patterns
    for (const pattern of newPatterns) {
      const existing = Array.from(this.patterns.values()).find(
        p => p.userId === userId && p.type === pattern.type && p.name === pattern.name
      );
      
      if (existing) {
        // Update existing pattern
        existing.occurrences++;
        existing.lastObserved = pattern.lastObserved;
        existing.confidence = (existing.confidence + pattern.confidence) / 2;
      } else {
        // Add new pattern
        pattern.id = `${userId}_${pattern.type}_${Date.now()}`;
        this.patterns.set(pattern.id, pattern);
      }
    }

    if (newPatterns.length > 0) {
      this.savePatterns(userId);
    }

    return newPatterns;
  }

  /**
   * Detect daily/weekly routines
   */
  private detectRoutine(userId: string, activity: ActivityWindow[]): Pattern | null {
    const hourCounts = new Array(24).fill(0);
    
    for (const a of activity) {
      const hour = new Date(a.timestamp).getHours();
      hourCounts[hour]++;
    }

    // Find peak hours
    const maxCount = Math.max(...hourCounts);
    const peakHours = hourCounts
      .map((count, hour) => ({ count, hour }))
      .filter(h => h.count > maxCount * 0.7)
      .map(h => h.hour);

    if (peakHours.length === 0) return null;

    // Check for daily pattern
    const dailyConfidence = maxCount / activity.length;
    
    if (dailyConfidence > 0.3) {
      return {
        id: "",
        userId,
        type: "routine",
        name: `Active around ${peakHours[0]}:00`,
        description: `User is typically active at ${peakHours.join(":00, ")}:00`,
        confidence: dailyConfidence,
        firstObserved: activity[0].timestamp,
        lastObserved: activity[activity.length - 1].timestamp,
        occurrences: activity.length,
        schedule: {
          type: "daily",
          timeOfDay: peakHours[0]
        },
        metadata: { peakHours },
        active: true
      };
    }

    return null;
  }

  /**
   * Detect mood cycles
   */
  private detectMoodCycle(userId: string, activity: ActivityWindow[]): Pattern | null {
    const sentiments = activity
      .filter(a => a.sentiment !== undefined)
      .map(a => a.sentiment!);

    if (sentiments.length < 5) return null;

    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avgSentiment, 2), 0) / sentiments.length;

    // Detect patterns by day of week
    const daySentiments: number[][] = Array.from({ length: 7 }, () => []);
    
    for (const a of activity) {
      if (a.sentiment !== undefined) {
        const day = new Date(a.timestamp).getDay();
        daySentiments[day].push(a.sentiment);
      }
    }

    // Find day with consistently different sentiment
    const dayAvgs = daySentiments.map((sents, day) => ({
      day,
      avg: sents.length > 0 ? sents.reduce((a, b) => a + b, 0) / sents.length : 0,
      count: sents.length
    }));

    const significantDay = dayAvgs.find(d => 
      d.count >= 3 && Math.abs(d.avg - avgSentiment) > 0.3
    );

    if (significantDay) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const mood = significantDay.avg > 0 ? "positive" : "negative";
      
      return {
        id: "",
        userId,
        type: "mood_cycle",
        name: `${dayNames[significantDay.day]} ${mood} mood`,
        description: `User tends to be more ${mood} on ${dayNames[significantDay.day]}s`,
        confidence: Math.min(0.9, Math.abs(significantDay.avg - avgSentiment) + 0.5),
        firstObserved: activity[0].timestamp,
        lastObserved: activity[activity.length - 1].timestamp,
        occurrences: significantDay.count,
        schedule: {
          type: "weekly",
          dayOfWeek: significantDay.day
        },
        metadata: { avgSentiment, daySentiment: significantDay.avg },
        active: true
      };
    }

    return null;
  }

  /**
   * Detect recurring topic clusters
   */
  private detectTopicClusters(userId: string, activity: ActivityWindow[]): Pattern[] {
    const patterns: Pattern[] = [];
    const topicCounts: Record<string, number> = {};

    for (const a of activity) {
      if (a.topic) {
        topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
      }
    }

    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count >= 3) {
        patterns.push({
          id: "",
          userId,
          type: "topic_cluster",
          name: `Frequently discusses ${topic}`,
          description: `User has mentioned ${topic} ${count} times`,
          confidence: Math.min(0.9, count / 10),
          firstObserved: activity[0].timestamp,
          lastObserved: activity[activity.length - 1].timestamp,
          occurrences: count,
          metadata: { topic },
          active: true
        });
      }
    }

    return patterns;
  }

  /**
   * Detect unusual activity spikes
   */
  private detectActivitySpikes(userId: string, activity: ActivityWindow[]): Pattern | null {
    // Group by day
    const dailyCounts: Record<string, number> = {};
    
    for (const a of activity) {
      const day = a.timestamp.split("T")[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }

    const counts = Object.values(dailyCounts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const max = Math.max(...counts);

    // Detect spike (> 3x average)
    if (max > avg * 3 && max > 10) {
      const spikeDay = Object.entries(dailyCounts).find(([_, count]) => count === max)?.[0];
      
      return {
        id: "",
        userId,
        type: "activity_spike",
        name: "High activity periods",
        description: `User has shown bursts of high activity (up to ${max} interactions/day)`,
        confidence: 0.7,
        firstObserved: activity[0].timestamp,
        lastObserved: spikeDay || activity[activity.length - 1].timestamp,
        occurrences: counts.filter(c => c > avg * 2).length,
        metadata: { avgDaily: avg, maxDaily: max, spikeDay },
        active: true
      };
    }

    return null;
  }

  /**
   * Detect significant behavior changes
   */
  private detectBehaviorChange(userId: string, activity: ActivityWindow[]): Pattern | null {
    if (activity.length < 20) return null;

    // Split activity in half
    const mid = Math.floor(activity.length / 2);
    const firstHalf = activity.slice(0, mid);
    const secondHalf = activity.slice(mid);

    // Compare activity types
    const firstTypes = firstHalf.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const secondTypes = secondHalf.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Detect shift in command usage
    const firstCommands = firstTypes["command"] || 0;
    const secondCommands = secondTypes["command"] || 0;

    if (secondCommands > firstCommands * 2 && secondCommands > 5) {
      return {
        id: "",
        userId,
        type: "behavior_change",
        name: "Increased tool usage",
        description: "User has started using more commands/tools recently",
        confidence: 0.75,
        firstObserved: activity[mid].timestamp,
        lastObserved: activity[activity.length - 1].timestamp,
        occurrences: 1,
        metadata: { 
          before: firstTypes, 
          after: secondTypes,
          change: "increased_commands" 
        },
        active: true
      };
    }

    return null;
  }

  /**
   * Get relevant patterns for current context
   */
  getRelevantPatterns(userId: string, context: {
    timeOfDay?: number;
    dayOfWeek?: number;
    currentTopic?: string;
    currentSentiment?: number;
  } = {}): PatternInsight[] {
    const userPatterns = Array.from(this.patterns.values())
      .filter(p => p.userId === userId && p.active);

    const insights: PatternInsight[] = [];

    for (const pattern of userPatterns) {
      let relevance = 0;
      let suggestion: string | undefined;

      switch (pattern.type) {
        case "routine":
          if (context.timeOfDay !== undefined && pattern.schedule?.timeOfDay !== undefined) {
            const hourDiff = Math.abs(context.timeOfDay - pattern.schedule.timeOfDay);
            if (hourDiff <= 1) {
              relevance = 0.9;
              suggestion = `User is usually active at this time`;
            }
          }
          break;

        case "mood_cycle":
          if (context.dayOfWeek !== undefined && pattern.schedule?.dayOfWeek !== undefined) {
            if (context.dayOfWeek === pattern.schedule.dayOfWeek) {
              relevance = 0.85;
              const mood = pattern.metadata.daySentiment > 0 ? "positive" : "negative";
              suggestion = `User tends to be more ${mood} on this day`;
            }
          }
          break;

        case "topic_cluster":
          if (context.currentTopic && pattern.metadata.topic === context.currentTopic) {
            relevance = 0.95;
            suggestion = `User frequently discusses this topic (${pattern.occurrences} times)`;
          }
          break;

        case "behavior_change":
          relevance = 0.6;
          suggestion = `User's behavior has changed recently: ${pattern.description}`;
          break;
      }

      if (relevance > 0.3) {
        insights.push({ pattern, relevance, suggestion });
      }
    }

    return insights.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Get pattern summary for user
   */
  getUserPatternSummary(userId: string): string {
    const patterns = Array.from(this.patterns.values())
      .filter(p => p.userId === userId && p.active);

    if (patterns.length === 0) {
      return "No established patterns yet";
    }

    const parts: string[] = [];

    // Routine
    const routine = patterns.find(p => p.type === "routine");
    if (routine) {
      parts.push(`Active around ${routine.schedule?.timeOfDay}:00`);
    }

    // Topics
    const topics = patterns.filter(p => p.type === "topic_cluster").slice(0, 3);
    if (topics.length > 0) {
      parts.push(`Often discusses: ${topics.map(t => t.metadata.topic).join(", ")}`);
    }

    // Mood
    const mood = patterns.find(p => p.type === "mood_cycle");
    if (mood) {
      parts.push(mood.description);
    }

    return parts.join(" | ");
  }

  /**
   * Get stats for debugging
   */
  getStats(): object {
    const byType: Record<string, number> = {};
    for (const pattern of this.patterns.values()) {
      byType[pattern.type] = (byType[pattern.type] || 0) + 1;
    }

    return {
      totalPatterns: this.patterns.size,
      byType,
      recentActivity: this.recentActivity.length
    };
  }
}

export const patternDetector = new PatternDetector();
