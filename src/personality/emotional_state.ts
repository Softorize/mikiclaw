import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Emotional state tracking for natural conversation flow
 * 
 * Tracks:
 * - Valence: Positive vs negative emotion (-1 to 1)
 * - Arousal: Energy level (0 to 1)
 * - Dominance: Assertiveness (0 to 1)
 * - Current mood category
 * - Conversation context
 */

export interface EmotionalState {
  // Core emotion dimensions (PAD model)
  valence: number;      // -1 (negative) to 1 (positive)
  arousal: number;      // 0 (calm) to 1 (excited/energetic)
  dominance: number;    // 0 (submissive/insecure) to 1 (assertive/confident)
  
  // Mood category
  currentMood: "playful" | "serious" | "supportive" | "professional" | "casual" | "concerned" | "excited";
  
  // Conversation tracking
  lastInteractionAt: string;
  interactionCount: number;
  
  // Emotional history (for detecting patterns)
  recentEmotions: Array<{
    timestamp: string;
    valence: number;
    arousal: number;
    trigger: string;
  }>;
  
  // Topic emotional associations
  topicEmotions: Record<string, {
    valence: number;
    lastDiscussed: string;
  }>;
}

const DEFAULT_STATE: EmotionalState = {
  valence: 0,
  arousal: 0.3,
  dominance: 0.5,
  currentMood: "casual",
  lastInteractionAt: new Date().toISOString(),
  interactionCount: 0,
  recentEmotions: [],
  topicEmotions: {}
};

// Emotion detection patterns
const EMOTION_PATTERNS = {
  // High valence, high arousal
  excited: {
    keywords: ["amazing", "awesome", "excellent", "fantastic", "love", "perfect", "wonderful", "yay", "woohoo", "!", "🎉", "❤️", "🔥"],
    valence: 0.8,
    arousal: 0.8
  },
  
  // High valence, moderate arousal
  happy: {
    keywords: ["good", "great", "nice", "happy", "glad", "pleased", "thanks", "thank you", "appreciate", "😊", "👍", "✨"],
    valence: 0.6,
    arousal: 0.5
  },
  
  // Low valence, high arousal
  angry: {
    keywords: ["angry", "frustrated", "annoying", "terrible", "awful", "hate", "stupid", "worst", "!!!", "😠", "😡", "🤬"],
    valence: -0.7,
    arousal: 0.8
  },
  
  // Low valence, moderate arousal
  sad: {
    keywords: ["sad", "disappointed", "unfortunately", "sorry", "miss", "regret", "worry", "concerned", "😢", "😔", "😞"],
    valence: -0.5,
    arousal: 0.4
  },
  
  // Low valence, low arousal
  tired: {
    keywords: ["tired", "exhausted", "bored", "whatever", "fine", "okay", "meh", "😴", "😪"],
    valence: -0.2,
    arousal: 0.2
  },
  
  // Neutral/serious
  serious: {
    keywords: ["important", "serious", "urgent", "critical", "problem", "issue", "concern", "need help", "please", "question"],
    valence: 0,
    arousal: 0.5
  },
  
  // Playful
  playful: {
    keywords: ["lol", "lmao", "haha", "funny", "joke", "play", "game", "😂", "🤣", "😄", "😆"],
    valence: 0.5,
    arousal: 0.6
  }
};

// AI response emotion indicators
const RESPONSE_EMOTIONS = {
  enthusiastic: {
    patterns: ["!", "🎉", "🔥", "awesome", "amazing", "excited"],
    valence: 0.7,
    arousal: 0.7
  },
  supportive: {
    patterns: ["understand", "help", "here for you", "support", "💙", "🤗"],
    valence: 0.5,
    arousal: 0.4
  },
  professional: {
    patterns: ["regarding", "furthermore", "additionally", "however", "therefore"],
    valence: 0,
    arousal: 0.3
  },
  concerned: {
    patterns: ["concern", "worry", "issue", "problem", "careful", "important"],
    valence: -0.2,
    arousal: 0.5
  }
};

class EmotionalStateManager {
  private stateDir: string;
  private stateCache: Map<string, EmotionalState> = new Map();

  constructor() {
    this.stateDir = join(configManager.getWorkspacePath(), "emotional_states");
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  private getStatePath(userId: string): string {
    return join(this.stateDir, `${userId}.json`);
  }

  getCurrent(userId: string): EmotionalState {
    if (this.stateCache.has(userId)) {
      return this.stateCache.get(userId)!;
    }

    const statePath = this.getStatePath(userId);
    if (existsSync(statePath)) {
      try {
        const content = readFileSync(statePath, "utf-8");
        const state = { ...DEFAULT_STATE, ...JSON.parse(content) };
        this.stateCache.set(userId, state);
        return state;
      } catch (e) {
        console.warn("Failed to load emotional state, using default");
      }
    }

    return { ...DEFAULT_STATE };
  }

  private saveState(userId: string, state: EmotionalState): void {
    state.lastInteractionAt = new Date().toISOString();
    this.stateCache.set(userId, state);
    
    try {
      writeFileSync(this.getStatePath(userId), JSON.stringify(state, null, 2));
    } catch (e) {
      console.warn("Failed to save emotional state:", e);
    }
  }

  /**
   * Detect emotion from user message and update state
   */
  detectFromMessage(userId: string, message: string): void {
    const state = this.getCurrent(userId);
    const lowerMessage = message.toLowerCase();
    
    // Track interaction
    state.interactionCount++;
    
    // Detect emotions from patterns
    let detectedValence = 0;
    let detectedArousal = 0.3; // Default moderate arousal
    let detectedMood: EmotionalState["currentMood"] = state.currentMood;
    let emotionSignals = 0;

    for (const [emotion, data] of Object.entries(EMOTION_PATTERNS)) {
      const matches = data.keywords.filter(k => lowerMessage.includes(k.toLowerCase()));
      if (matches.length > 0) {
        detectedValence += data.valence * matches.length;
        detectedArousal += data.arousal * matches.length;
        emotionSignals += matches.length;
        
        // Set mood based on strongest signal
        if (matches.length > 0) {
          switch (emotion) {
            case "excited": detectedMood = "excited"; break;
            case "happy": detectedMood = "playful"; break;
            case "angry": detectedMood = "concerned"; break;
            case "sad": detectedMood = "supportive"; break;
            case "tired": detectedMood = "casual"; break;
            case "serious": detectedMood = "serious"; break;
            case "playful": detectedMood = "playful"; break;
          }
        }
      }
    }

    // Normalize if we found signals
    if (emotionSignals > 0) {
      detectedValence /= emotionSignals;
      detectedArousal /= emotionSignals;
    }

    // Adjust for punctuation
    const exclamationCount = (message.match(/!/g) || []).length;
    const questionCount = (message.match(/\?/g) || []).length;
    
    if (exclamationCount > 1) {
      detectedArousal = Math.min(1, detectedArousal + 0.2);
      detectedValence = Math.min(1, detectedValence + 0.1);
    }
    
    if (questionCount > 2) {
      detectedArousal = Math.min(1, detectedArousal + 0.1);
    }

    // Smooth transition (70% old state, 30% new detection)
    state.valence = state.valence * 0.7 + detectedValence * 0.3;
    state.arousal = state.arousal * 0.7 + detectedArousal * 0.3;
    state.currentMood = detectedMood;

    // Store in recent emotions (keep last 20)
    state.recentEmotions.push({
      timestamp: new Date().toISOString(),
      valence: state.valence,
      arousal: state.arousal,
      trigger: message.slice(0, 100)
    });
    
    if (state.recentEmotions.length > 20) {
      state.recentEmotions = state.recentEmotions.slice(-20);
    }

    // Detect topic and associate emotion
    this.associateTopicEmotion(state, message);

    this.saveState(userId, state);
  }

  /**
   * Update emotional state based on AI's own response
   */
  updateFromResponse(userId: string, response: string): void {
    const state = this.getCurrent(userId);
    const lowerResponse = response.toLowerCase();

    // Detect emotion from AI's own response
    let responseValence = 0;
    let responseArousal = 0;
    let signalCount = 0;

    for (const [emotion, data] of Object.entries(RESPONSE_EMOTIONS)) {
      const matches = data.patterns.filter(p => lowerResponse.includes(p.toLowerCase()));
      if (matches.length > 0) {
        responseValence += data.valence * matches.length;
        responseArousal += data.arousal * matches.length;
        signalCount += matches.length;
      }
    }

    if (signalCount > 0) {
      responseValence /= signalCount;
      responseArousal /= signalCount;
      
      // AI's emotion slightly influences the conversation mood
      state.valence = state.valence * 0.8 + responseValence * 0.2;
      state.arousal = state.arousal * 0.8 + responseArousal * 0.2;
    }

    this.saveState(userId, state);
  }

  /**
   * Associate detected emotion with topics in the message
   */
  private associateTopicEmotion(state: EmotionalState, message: string): void {
    // Simple topic extraction - can be enhanced with NLP
    const topicPatterns = [
      /\b(work|job|career|office|boss|colleague)\b/gi,
      /\b(code|programming|software|app|website|debug)\b/gi,
      /\b(family|mom|dad|parent|sister|brother|wife|husband)\b/gi,
      /\b(friend|social|party|hang out|meet up)\b/gi,
      /\b(health|gym|exercise|diet|doctor|sick)\b/gi,
      /\b(money|finance|budget|save|spend|invest)\b/gi,
      /\b(learn|study|course|book|read|education)\b/gi,
      /\b(travel|trip|vacation|flight|hotel|visit)\b/gi
    ];

    for (const pattern of topicPatterns) {
      const matches = message.match(pattern);
      if (matches) {
        const topic = matches[0].toLowerCase();
        state.topicEmotions[topic] = {
          valence: state.valence,
          lastDiscussed: new Date().toISOString()
        };
      }
    }
  }

  /**
   * Get emotional context for a specific topic
   */
  getTopicEmotion(userId: string, topic: string): { valence: number; lastDiscussed: string } | null {
    const state = this.getCurrent(userId);
    return state.topicEmotions[topic.toLowerCase()] || null;
  }

  /**
   * Check if we should add a personality touch (joke, fun fact, etc.)
   */
  shouldAddPersonalityTouch(userId: string): { should: boolean; type?: "joke" | "fact" | "greeting"; reason: string } {
    const state = this.getCurrent(userId);
    
    // Don't add personality touches in serious mode
    if (state.currentMood === "serious" || state.currentMood === "concerned") {
      return { should: false, reason: "Conversation is serious" };
    }

    // Check last personality touch
    const recentTouches = state.recentEmotions.filter(e => 
      e.trigger.includes("joke") || e.trigger.includes("fun fact")
    );
    
    if (recentTouches.length > 0) {
      const lastTouch = new Date(recentTouches[recentTouches.length - 1].timestamp);
      const minutesSince = (Date.now() - lastTouch.getTime()) / (1000 * 60);
      
      if (minutesSince < 10) {
        return { should: false, reason: "Too soon after last personality touch" };
      }
    }

    // Only in positive or playful moods
    if (state.valence > 0.3 && state.arousal > 0.4) {
      // 30% chance in playful conversations
      if (state.currentMood === "playful" && Math.random() < 0.3) {
        return { should: true, type: "joke", reason: "Playful mood detected" };
      }
      
      // 20% chance in positive conversations
      if (Math.random() < 0.2) {
        return { should: true, type: "fact", reason: "Positive conversation" };
      }
    }

    return { should: false, reason: "Conditions not met" };
  }

  /**
   * Get conversation tone recommendation
   */
  getToneRecommendation(userId: string): {
    style: "warm" | "professional" | "playful" | "supportive";
    energy: "high" | "moderate" | "low";
    formality: "formal" | "casual";
  } {
    const state = this.getCurrent(userId);

    let style: "warm" | "professional" | "playful" | "supportive" = "warm";
    if (state.valence < -0.3) style = "supportive";
    else if (state.currentMood === "playful") style = "playful";
    else if (state.currentMood === "professional" || state.currentMood === "serious") style = "professional";

    let energy: "high" | "moderate" | "low" = "moderate";
    if (state.arousal > 0.6) energy = "high";
    else if (state.arousal < 0.3) energy = "low";

    let formality: "formal" | "casual" = state.currentMood === "professional" ? "formal" : "casual";

    return { style, energy, formality };
  }

  /**
   * Reset emotional state (e.g., for testing or new conversation)
   */
  reset(userId: string): void {
    this.saveState(userId, { ...DEFAULT_STATE });
  }
}

export const emotionalState = new EmotionalStateManager();
