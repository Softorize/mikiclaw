import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * AI Voice Consistency Tracking
 * 
 * Ensures the AI maintains a consistent personality across responses
 * Tracks speech patterns, common phrases, and response characteristics
 */

export interface AIVoiceProfile {
  // Core voice characteristics
  personality: {
    warmth: number;           // 1-10: How warm/friendly
    humor: number;            // 1-10: How much humor is used
    formality: number;        // 1-10: Formal vs casual
    enthusiasm: number;       // 1-10: Energy level
    empathy: number;          // 1-10: Emotional attunement
  };
  
  // Speech patterns
  patterns: {
    greetingStyle: string[];      // How AI greets ("Hey there!", "Hello!")
    closingStyle: string[];       // How AI closes ("Let me know if...")
    transitionPhrases: string[];  // Phrases used to transition ("By the way...")
    explanationStyle: "analogy" | "step-by-step" | "technical" | "simple" | "mixed";
    questionStyle: "direct" | "rhetorical" | "socratic" | "mixed";
  };
  
  // Common phrases and expressions
  commonPhrases: Array<{
    phrase: string;
    count: number;
    context: string[];  // Types of responses where used
  }>;
  
  // Emoji usage patterns
  emojiStyle: {
    frequency: "none" | "low" | "moderate" | "high";
    preferredEmojis: string[];
    avoidedEmojis: string[];
  };
  
  // Response characteristics
  responseStyle: {
    avgLength: number;        // Average response length in characters
    prefersBullets: boolean;
    usesCodeBlocks: boolean;
    asksFollowUp: boolean;    // Usually asks follow-up questions
  };
  
  // Consistency metrics
  metrics: {
    totalResponses: number;
    lastUpdated: string;
    consistencyScore: number; // How consistent recent responses are with voice
  };
}

const DEFAULT_VOICE: AIVoiceProfile = {
  personality: {
    warmth: 7,
    humor: 4,
    formality: 4,
    enthusiasm: 6,
    empathy: 7
  },
  patterns: {
    greetingStyle: ["Hey there!", "Hello!", "Hi!"],
    closingStyle: ["Let me know if you need anything else!", "Hope that helps!"],
    transitionPhrases: ["By the way", "Also", "Speaking of which"],
    explanationStyle: "mixed",
    questionStyle: "direct"
  },
  commonPhrases: [],
  emojiStyle: {
    frequency: "moderate",
    preferredEmojis: ["👋", "✨", "🎉", "💡", "🔧"],
    avoidedEmojis: []
  },
  responseStyle: {
    avgLength: 300,
    prefersBullets: true,
    usesCodeBlocks: true,
    asksFollowUp: true
  },
  metrics: {
    totalResponses: 0,
    lastUpdated: new Date().toISOString(),
    consistencyScore: 1.0
  }
};

// Phrases to track for voice consistency
const VOICE_INDICATORS = {
  warm: ["happy to help", "glad to", "I'd love to", "absolutely", "of course", "sure thing"],
  humorous: ["haha", "😄", "😂", "funny", "silly", "just kidding"],
  formal: ["regarding", "furthermore", "however", "therefore", "additionally"],
  enthusiastic: ["awesome", "amazing", "fantastic", "exciting", "love", "🔥", "🎉"],
  empathetic: ["I understand", "that makes sense", "I hear you", "sounds tough", "🤗", "💙"]
};

class AIVoiceTracker {
  private voiceDir: string;
  private voiceCache: Map<string, AIVoiceProfile> = new Map();

  constructor() {
    this.voiceDir = join(configManager.getWorkspacePath(), "ai_voices");
    if (!existsSync(this.voiceDir)) {
      mkdirSync(this.voiceDir, { recursive: true });
    }
  }

  private getVoicePath(userId: string): string {
    return join(this.voiceDir, `${userId}.json`);
  }

  getVoice(userId: string): AIVoiceProfile {
    if (this.voiceCache.has(userId)) {
      return this.voiceCache.get(userId)!;
    }

    const voicePath = this.getVoicePath(userId);
    if (existsSync(voicePath)) {
      try {
        const content = readFileSync(voicePath, "utf-8");
        const voice = { ...DEFAULT_VOICE, ...JSON.parse(content) };
        this.voiceCache.set(userId, voice);
        return voice;
      } catch (e) {
        console.warn("Failed to load AI voice, using default");
      }
    }

    return { ...DEFAULT_VOICE };
  }

  private saveVoice(userId: string, voice: AIVoiceProfile): void {
    voice.metrics.lastUpdated = new Date().toISOString();
    this.voiceCache.set(userId, voice);
    
    try {
      writeFileSync(this.getVoicePath(userId), JSON.stringify(voice, null, 2));
    } catch (e) {
      console.warn("Failed to save AI voice:", e);
    }
  }

  /**
   * Analyze a response and update voice profile
   */
  analyzeResponse(userId: string, response: string): void {
    const voice = this.getVoice(userId);
    voice.metrics.totalResponses++;

    // Update average length
    const oldAvg = voice.responseStyle.avgLength;
    const total = voice.metrics.totalResponses;
    voice.responseStyle.avgLength = Math.round(
      (oldAvg * (total - 1) + response.length) / total
    );

    // Detect and update personality traits
    const lowerResponse = response.toLowerCase();
    
    // Check warmth indicators
    const warmthCount = VOICE_INDICATORS.warm.filter(w => lowerResponse.includes(w)).length;
    if (warmthCount > 0) {
      voice.personality.warmth = Math.min(10, voice.personality.warmth + 0.1);
    }

    // Check humor indicators
    const humorCount = VOICE_INDICATORS.humorous.filter(h => lowerResponse.includes(h)).length;
    if (humorCount > 0) {
      voice.personality.humor = Math.min(10, voice.personality.humor + 0.1);
    }

    // Check formality
    const formalCount = VOICE_INDICATORS.formal.filter(f => lowerResponse.includes(f)).length;
    if (formalCount > 2) {
      voice.personality.formality = Math.min(10, voice.personality.formality + 0.2);
    } else if (formalCount === 0) {
      voice.personality.formality = Math.max(1, voice.personality.formality - 0.05);
    }

    // Check enthusiasm
    const enthusiasmCount = VOICE_INDICATORS.enthusiastic.filter(e => lowerResponse.includes(e)).length;
    if (enthusiasmCount > 0) {
      voice.personality.enthusiasm = Math.min(10, voice.personality.enthusiasm + 0.1);
    }

    // Check empathy
    const empathyCount = VOICE_INDICATORS.empathetic.filter(e => lowerResponse.includes(e)).length;
    if (empathyCount > 0) {
      voice.personality.empathy = Math.min(10, voice.personality.empathy + 0.1);
    }

    // Track common phrases (3+ word sequences)
    const words = response.split(/\s+/);
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(" ").toLowerCase().replace(/[^\w\s]/g, "");
      if (phrase.length > 10) {
        const existing = voice.commonPhrases.find(p => p.phrase === phrase);
        if (existing) {
          existing.count++;
        } else if (voice.commonPhrases.length < 50) {
          voice.commonPhrases.push({ phrase, count: 1, context: [] });
        }
      }
    }

    // Sort by frequency and keep top phrases
    voice.commonPhrases.sort((a, b) => b.count - a.count);
    voice.commonPhrases = voice.commonPhrases.slice(0, 30);

    // Detect emoji usage
    const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (response.match(emojiPattern) || []).length;
    
    if (emojiCount === 0) {
      voice.emojiStyle.frequency = "none";
    } else if (emojiCount <= 2) {
      voice.emojiStyle.frequency = "low";
    } else if (emojiCount <= 5) {
      voice.emojiStyle.frequency = "moderate";
    } else {
      voice.emojiStyle.frequency = "high";
    }

    // Track specific emojis used
    const emojis = response.match(emojiPattern) || [];
    for (const emoji of emojis) {
      if (!voice.emojiStyle.preferredEmojis.includes(emoji)) {
        voice.emojiStyle.preferredEmojis.push(emoji);
      }
    }
    voice.emojiStyle.preferredEmojis = voice.emojiStyle.preferredEmojis.slice(0, 15);

    // Detect response style
    voice.responseStyle.prefersBullets = response.includes("•") || response.includes("- ");
    voice.responseStyle.usesCodeBlocks = response.includes("```");
    voice.responseStyle.asksFollowUp = response.includes("?");

    this.saveVoice(userId, voice);
  }

  /**
   * Get voice guidelines for ensuring consistency
   */
  getVoiceGuidelines(userId: string): string {
    const voice = this.getVoice(userId);
    
    const guidelines: string[] = [];
    
    // Personality-based guidelines
    if (voice.personality.warmth > 6) {
      guidelines.push("- Be warm and welcoming in responses");
    }
    if (voice.personality.humor > 5) {
      guidelines.push("- Include light humor when appropriate");
    }
    if (voice.personality.formality > 6) {
      guidelines.push("- Use professional, formal language");
    } else {
      guidelines.push("- Keep tone casual and conversational");
    }
    if (voice.personality.enthusiasm > 6) {
      guidelines.push("- Show enthusiasm and energy");
    }
    if (voice.personality.empathy > 6) {
      guidelines.push("- Show empathy and understanding");
    }

    // Pattern-based guidelines
    if (voice.responseStyle.prefersBullets) {
      guidelines.push("- Use bullet points for lists when helpful");
    }
    if (voice.responseStyle.asksFollowUp) {
      guidelines.push("- Ask follow-up questions to engage the user");
    }

    // Emoji guidelines
    switch (voice.emojiStyle.frequency) {
      case "none":
        guidelines.push("- Avoid using emojis");
        break;
      case "low":
        guidelines.push("- Use emojis sparingly (1-2 per message)");
        break;
      case "moderate":
        guidelines.push("- Use emojis naturally (2-3 per message)");
        break;
      case "high":
        guidelines.push("- Use emojis expressively (3-5 per message)");
        break;
    }

    // Response length guideline
    const avgWords = Math.round(voice.responseStyle.avgLength / 5);
    if (avgWords < 50) {
      guidelines.push("- Keep responses concise");
    } else if (avgWords > 150) {
      guidelines.push("- Provide comprehensive responses");
    } else {
      guidelines.push("- Balance detail with brevity");
    }

    // Common phrases to maintain consistency
    if (voice.commonPhrases.length > 0) {
      const topPhrases = voice.commonPhrases
        .slice(0, 3)
        .map(p => `"${p.phrase}"`)
        .join(", ");
      guidelines.push(`- Your natural expressions include: ${topPhrases}`);
    }

    return guidelines.join("\n");
  }

  /**
   * Check if a response is consistent with established voice
   */
  checkConsistency(userId: string, response: string): {
    isConsistent: boolean;
    score: number;
    issues: string[];
  } {
    const voice = this.getVoice(userId);
    const issues: string[] = [];
    let score = 1.0;

    // Check response length consistency
    const lengthDiff = Math.abs(response.length - voice.responseStyle.avgLength);
    if (lengthDiff > voice.responseStyle.avgLength * 2) {
      issues.push("Response length significantly different from usual style");
      score -= 0.2;
    }

    // Check emoji consistency
    const emojiCount = (response.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    const expectedEmoji = voice.emojiStyle.frequency === "high" ? 3 : 
                         voice.emojiStyle.frequency === "moderate" ? 2 :
                         voice.emojiStyle.frequency === "low" ? 1 : 0;
    
    if (Math.abs(emojiCount - expectedEmoji) > 2) {
      issues.push("Emoji usage inconsistent with established pattern");
      score -= 0.1;
    }

    // Check formality consistency
    const formalWords = ["regarding", "furthermore", "however", "therefore"];
    const formalCount = formalWords.filter(w => response.toLowerCase().includes(w)).length;
    
    if (voice.personality.formality < 4 && formalCount > 2) {
      issues.push("Too formal for established casual voice");
      score -= 0.15;
    } else if (voice.personality.formality > 6 && formalCount === 0) {
      issues.push("Too casual for established formal voice");
      score -= 0.15;
    }

    // Update consistency score
    voice.metrics.consistencyScore = voice.metrics.consistencyScore * 0.9 + score * 0.1;
    this.saveVoice(userId, voice);

    return {
      isConsistent: score > 0.7,
      score,
      issues
    };
  }

  /**
   * Get voice characteristics summary for debugging
   */
  getVoiceSummary(userId: string): string {
    const voice = this.getVoice(userId);
    
    return `
AI Voice Profile for user ${userId}:
- Warmth: ${voice.personality.warmth}/10
- Humor: ${voice.personality.humor}/10
- Formality: ${voice.personality.formality}/10
- Enthusiasm: ${voice.personality.enthusiasm}/10
- Empathy: ${voice.personality.empathy}/10
- Emoji frequency: ${voice.emojiStyle.frequency}
- Avg response length: ${voice.responseStyle.avgLength} chars
- Total responses analyzed: ${voice.metrics.totalResponses}
- Consistency score: ${voice.metrics.consistencyScore.toFixed(2)}
`.trim();
  }

  /**
   * Reset voice for a user
   */
  resetVoice(userId: string): void {
    this.saveVoice(userId, { ...DEFAULT_VOICE });
  }
}

export const aiVoice = new AIVoiceTracker();
