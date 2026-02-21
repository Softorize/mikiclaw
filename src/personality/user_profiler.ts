import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * User communication style profile
 */
export interface CommunicationStyle {
  // Formality level (1-10)
  formality: number;
  // Verbosity preference (1-10)
  verbosity: number;
  // Technical level (1-10)
  technicalLevel: number;
  // Emoji usage preference (1-10)
  emojiUsage: number;
  // Response length preference (short/medium/long)
  responseLength: "short" | "medium" | "long";
  // Greeting style
  greetingStyle: "casual" | "professional" | "friendly";
  // Uses questions often?
  asksQuestions: boolean;
  // Prefers bullet points?
  prefersBullets: boolean;
  // Typical message length
  avgMessageLength: number;
  // Common topics
  commonTopics: string[];
  // Interaction count
  interactionCount: number;
  // Last updated
  lastUpdated: string;
}

/**
 * Learned user preferences
 */
export interface UserPreferences {
  // Topics of interest
  interests: Array<{ topic: string; level: number; lastDiscussed: string }>;
  // Pet peeves / dislikes
  dislikes: string[];
  // Working style
  workingStyle: {
    collaborative: boolean;
    independent: boolean;
    needsGuidance: boolean;
    prefersExamples: boolean;
  };
  // Learning preferences
  learningStyle: {
    visual: boolean;
    verbal: boolean;
    handsOn: boolean;
    theoretical: boolean;
  };
  // Time preferences
  timePreferences: {
    concise: boolean;
    detailed: boolean;
    stepByStep: boolean;
  };
  // Humor preferences (adaptive)
  humorPreferences: {
    dadJokes: { likes: number; dislikes: number };
    techJokes: { likes: number; dislikes: number };
    puns: { likes: number; dislikes: number };
    funFacts: { likes: number; dislikes: number };
    preferredType: "dad" | "tech" | "puns" | "mixed" | null;
  };
}

/**
 * Personality adaptation state
 */
export interface PersonalityState {
  // Current warmth level (1-10)
  warmth: number;
  // Current enthusiasm (1-10)
  enthusiasm: number;
  // Current humor level (1-10)
  humor: number;
  // Current empathy (1-10)
  empathy: number;
  // Adaptation history
  adaptations: Array<{
    timestamp: string;
    trigger: string;
    change: string;
    reason: string;
  }>;
}

const DEFAULT_COMMUNICATION_STYLE: CommunicationStyle = {
  formality: 5,
  verbosity: 5,
  technicalLevel: 5,
  emojiUsage: 3,
  responseLength: "medium",
  greetingStyle: "friendly",
  asksQuestions: true,
  prefersBullets: false,
  avgMessageLength: 100,
  commonTopics: [],
  interactionCount: 0,
  lastUpdated: new Date().toISOString()
};

const DEFAULT_PREFERENCES: UserPreferences = {
  interests: [],
  dislikes: [],
  workingStyle: {
    collaborative: true,
    independent: false,
    needsGuidance: false,
    prefersExamples: true
  },
  learningStyle: {
    visual: false,
    verbal: true,
    handsOn: false,
    theoretical: false
  },
  timePreferences: {
    concise: false,
    detailed: false,
    stepByStep: false
  },
  humorPreferences: {
    dadJokes: { likes: 0, dislikes: 0 },
    techJokes: { likes: 0, dislikes: 0 },
    puns: { likes: 0, dislikes: 0 },
    funFacts: { likes: 0, dislikes: 0 },
    preferredType: null
  }
};

const DEFAULT_PERSONALITY: PersonalityState = {
  warmth: 7,
  enthusiasm: 6,
  humor: 4,
  empathy: 7,
  adaptations: []
};

class UserProfiler {
  private profilePath: string;
  private styleCache: CommunicationStyle | null = null;
  private preferencesCache: UserPreferences | null = null;
  private personalityCache: PersonalityState | null = null;

  constructor(private userId: string) {
    const workspacePath = configManager.getWorkspacePath();
    const profilesDir = join(workspacePath, "profiles");
    
    if (!existsSync(profilesDir)) {
      mkdirSync(profilesDir, { recursive: true });
    }
    
    this.profilePath = join(profilesDir, `${userId}.json`);
  }

  /**
   * Load or create user profile
   */
  loadProfile(): {
    style: CommunicationStyle;
    preferences: UserPreferences;
    personality: PersonalityState;
  } {
    if (!existsSync(this.profilePath)) {
      return {
        style: { ...DEFAULT_COMMUNICATION_STYLE },
        preferences: { ...DEFAULT_PREFERENCES },
        personality: { ...DEFAULT_PERSONALITY }
      };
    }

    try {
      const content = readFileSync(this.profilePath, "utf-8");
      const data = JSON.parse(content);
      
      return {
        style: { ...DEFAULT_COMMUNICATION_STYLE, ...data.style },
        preferences: { ...DEFAULT_PREFERENCES, ...data.preferences },
        personality: { ...DEFAULT_PERSONALITY, ...data.personality }
      };
    } catch (e) {
      console.warn("Failed to load user profile, using defaults");
      return {
        style: { ...DEFAULT_COMMUNICATION_STYLE },
        preferences: { ...DEFAULT_PREFERENCES },
        personality: { ...DEFAULT_PERSONALITY }
      };
    }
  }

  /**
   * Save user profile
   */
  saveProfile(profile: {
    style: CommunicationStyle;
    preferences: UserPreferences;
    personality: PersonalityState;
  }): void {
    profile.style.lastUpdated = new Date().toISOString();
    writeFileSync(this.profilePath, JSON.stringify(profile, null, 2));
    this.styleCache = profile.style;
    this.preferencesCache = profile.preferences;
    this.personalityCache = profile.personality;
  }

  /**
   * Analyze message and update communication style
   */
  analyzeMessage(message: string): void {
    const profile = this.loadProfile();
    
    // Update interaction count
    profile.style.interactionCount++;
    
    // Analyze message length
    const messageLength = message.length;
    profile.style.avgMessageLength = Math.round(
      (profile.style.avgMessageLength * (profile.style.interactionCount - 1) + messageLength) /
      profile.style.interactionCount
    );
    
    // Detect formality (simple heuristics)
    const formalWords = ["please", "thank", "would", "could", "may", "sir", "madam"];
    const informalWords = ["hey", "yo", "lol", "omg", "thx", "plz", "gonna", "wanna"];
    
    const lowerMessage = message.toLowerCase();
    const formalCount = formalWords.filter(w => lowerMessage.includes(w)).length;
    const informalCount = informalWords.filter(w => lowerMessage.includes(w)).length;
    
    if (formalCount > informalCount) {
      profile.style.formality = Math.min(10, profile.style.formality + 0.2);
    } else if (informalCount > formalCount) {
      profile.style.formality = Math.max(1, profile.style.formality - 0.2);
    }
    
    // Detect technical level
    const techPatterns = [
      /\b(API|SDK|IDE|CLI|HTTP|JSON|XML|HTML|CSS|SQL|Git)\b/i,
      /\b(function|class|interface|type|const|let|var)\b/,
      /\b(docker|kubernetes|aws|azure|gcp|linux|unix)\b/i,
      /[{}[\]()]/,  // Code brackets
      /=>|::|::/    // Code operators
    ];
    
    const techMatchCount = techPatterns.filter(p => p.test(message)).length;
    if (techMatchCount >= 2) {
      profile.style.technicalLevel = Math.min(10, profile.style.technicalLevel + 0.3);
      profile.style.commonTopics = this.addTopic(profile.style.commonTopics, "technology");
    }
    
    // Detect emoji usage
    const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (message.match(emojiPattern) || []).length;
    if (emojiCount > 0) {
      profile.style.emojiUsage = Math.min(10, profile.style.emojiUsage + 0.5);
    }
    
    // Detect question asking
    profile.style.asksQuestions = message.includes("?");
    
    // Detect bullet point preference
    profile.style.prefersBullets = message.includes("•") || message.includes("- ") || message.includes("\n");
    
    // Detect topics
    const topicKeywords: Record<string, string[]> = {
      coding: ["code", "program", "debug", "function", "variable", "loop"],
      design: ["design", "ui", "ux", "layout", "color", "font"],
      business: ["business", "marketing", "sales", "revenue", "profit"],
      learning: ["learn", "study", "understand", "teach", "explain"],
      creative: ["creative", "art", "write", "story", "imagine"]
    };
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(k => lowerMessage.includes(k))) {
        profile.style.commonTopics = this.addTopic(profile.style.commonTopics, topic);
        profile.preferences.interests = this.addInterest(
          profile.preferences.interests,
          topic
        );
      }
    }
    
    // Detect verbosity preference from message structure
    if (message.length > 200) {
      profile.style.verbosity = Math.min(10, profile.style.verbosity + 0.2);
      profile.style.responseLength = "long";
    } else if (message.length < 50) {
      profile.style.verbosity = Math.max(1, profile.style.verbosity - 0.2);
      profile.style.responseLength = "short";
    }
    
    this.saveProfile(profile);
  }

  /**
   * Learn from conversation outcome
   */
  learnFromInteraction(
    userMessage: string,
    assistantResponse: string,
    userSatisfaction?: "positive" | "negative" | "neutral"
  ): void {
    const profile = this.loadProfile();
    
    // If user seems satisfied, reinforce current style
    if (userSatisfaction === "positive" || 
        userMessage.toLowerCase().includes("thank") ||
        userMessage.toLowerCase().includes("great") ||
        userMessage.toLowerCase().includes("perfect")) {
      
      // Reinforce successful patterns
      profile.personality.warmth = Math.min(10, profile.personality.warmth + 0.1);
      profile.personality.adaptations.push({
        timestamp: new Date().toISOString(),
        trigger: "positive_feedback",
        change: "increased_warmth",
        reason: "User responded positively to interaction"
      });
    }
    
    // If user seems frustrated, adjust approach
    if (userSatisfaction === "negative" ||
        userMessage.toLowerCase().includes("wrong") ||
        userMessage.toLowerCase().includes("not what") ||
        userMessage.toLowerCase().includes("confusing")) {
      
      profile.personality.empathy = Math.min(10, profile.personality.empathy + 0.2);
      profile.personality.adaptations.push({
        timestamp: new Date().toISOString(),
        trigger: "negative_feedback",
        change: "increased_empathy",
        reason: "User seemed frustrated, increasing empathy"
      });
    }
    
    // Keep only last 50 adaptations
    if (profile.personality.adaptations.length > 50) {
      profile.personality.adaptations = profile.personality.adaptations.slice(-50);
    }
    
    this.saveProfile(profile);
  }

  /**
   * Get personality prompt adjustments based on learned style
   */
  getPersonalityPrompt(): string {
    const profile = this.loadProfile();
    
    const adjustments: string[] = [];
    
    // Adjust formality
    if (profile.style.formality >= 7) {
      adjustments.push("- Use professional, formal language");
    } else if (profile.style.formality <= 3) {
      adjustments.push("- Use casual, friendly language");
    }
    
    // Adjust verbosity
    if (profile.style.verbosity >= 7) {
      adjustments.push("- Provide detailed, comprehensive responses");
    } else if (profile.style.verbosity <= 3) {
      adjustments.push("- Keep responses concise and brief");
    }
    
    // Adjust technical level
    if (profile.style.technicalLevel >= 7) {
      adjustments.push("- Use technical terminology when appropriate");
      adjustments.push("- Assume user has technical knowledge");
    } else if (profile.style.technicalLevel <= 3) {
      adjustments.push("- Explain technical concepts simply");
      adjustments.push("- Avoid jargon");
    }
    
    // Adjust emoji usage
    if (profile.style.emojiUsage >= 7) {
      adjustments.push("- Use emojis frequently to express emotion");
    } else if (profile.style.emojiUsage <= 2) {
      adjustments.push("- Minimize emoji usage");
    }
    
    // Adjust response length
    adjustments.push(`- Prefer ${profile.style.responseLength} responses`);
    
    // Adjust greeting style
    if (profile.style.greetingStyle === "casual") {
      adjustments.push("- Start conversations casually (Hey! Hi!)");
    } else if (profile.style.greetingStyle === "professional") {
      adjustments.push("- Start conversations professionally");
    }
    
    // Working style adjustments
    if (profile.preferences.workingStyle.prefersExamples) {
      adjustments.push("- Always provide examples when explaining concepts");
    }
    if (profile.preferences.workingStyle.needsGuidance) {
      adjustments.push("- Provide step-by-step guidance");
    }
    if (profile.preferences.timePreferences.stepByStep) {
      adjustments.push("- Break down complex tasks into numbered steps");
    }
    
    // Learning style adjustments
    if (profile.preferences.learningStyle.visual) {
      adjustments.push("- Use diagrams, charts, and visual descriptions");
    }
    if (profile.preferences.learningStyle.handsOn) {
      adjustments.push("- Provide practical, hands-on examples");
    }
    
    return adjustments.join("\n");
  }

  /**
   * Get user interests for context
   */
  getInterestContext(): string {
    const profile = this.loadProfile();
    
    if (profile.preferences.interests.length === 0) {
      return "";
    }
    
    const topInterests = profile.preferences.interests
      .sort((a, b) => b.level - a.level)
      .slice(0, 5);
    
    return `User interests: ${topInterests.map(i => i.topic).join(", ")}`;
  }

  private addTopic(topics: string[], topic: string): string[] {
    if (!topics.includes(topic)) {
      topics.push(topic);
    }
    return topics.slice(-10); // Keep last 10 topics
  }

  private addInterest(
    interests: Array<{ topic: string; level: number; lastDiscussed: string }>,
    topic: string
  ): Array<{ topic: string; level: number; lastDiscussed: string }> {
    const existing = interests.find(i => i.topic === topic);
    if (existing) {
      existing.level = Math.min(10, existing.level + 1);
      existing.lastDiscussed = new Date().toISOString();
    } else {
      interests.push({
        topic,
        level: 1,
        lastDiscussed: new Date().toISOString()
      });
    }
    return interests.sort((a, b) => b.level - a.level).slice(0, 20);
  }

  /**
   * Track user's reaction to a joke or fun fact
   * @param type - "dad" | "tech" | "puns" | "funFact"
   * @param reaction - "positive" (laugh, haha, lol) | "negative" (ugh, groan, boring)
   */
  trackHumorReaction(type: "dad" | "tech" | "puns" | "funFact", reaction: "positive" | "negative"): void {
    const profile = this.loadProfile();

    let humorPref: UserPreferences["humorPreferences"][keyof UserPreferences["humorPreferences"]];
    let key: "dadJokes" | "techJokes" | "puns" | "funFacts";

    switch (type) {
      case "dad": key = "dadJokes"; break;
      case "tech": key = "techJokes"; break;
      case "puns": key = "puns"; break;
      case "funFact": key = "funFacts"; break;
    }

    humorPref = profile.preferences.humorPreferences[key];

    if (reaction === "positive") {
      humorPref.likes++;
    } else {
      humorPref.dislikes++;
    }

    // Calculate preferred type based on ratio
    const types = ["dadJokes", "techJokes", "puns", "funFacts"] as const;
    let bestType: "dad" | "tech" | "puns" | "mixed" | null = null;
    let bestRatio = -1;

    for (const t of types) {
      const pref = profile.preferences.humorPreferences[t];
      const total = pref.likes + pref.dislikes;
      if (total >= 3) { // Need at least 3 interactions to establish preference
        const ratio = pref.likes / total;
        if (ratio > bestRatio && ratio > 0.5) {
          bestRatio = ratio;
          if (t === "dadJokes") bestType = "dad";
          else if (t === "techJokes") bestType = "tech";
          else if (t === "puns") bestType = "puns";
        }
      }
    }

    profile.preferences.humorPreferences.preferredType = bestType;
    this.saveProfile(profile);
  }

  /**
   * Get learned humor preference for joke selection
   */
  getHumorPreference(): "dad" | "tech" | "puns" | "mixed" | null {
    const profile = this.loadProfile();
    return profile.preferences.humorPreferences.preferredType;
  }
}

export { UserProfiler };
