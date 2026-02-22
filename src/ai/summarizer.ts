import { configManager } from "../config/manager.js";
import { aiClient, AIMessage } from "./client.js";

/**
 * AI-Powered Conversation Summarizer
 * 
 * Uses AI to generate intelligent summaries of conversations
 * Extracts key points, topics, user goals, and action items
 */

export interface ConversationSummary {
  overview: string;
  keyPoints: string[];
  topics: string[];
  userGoals: string[];
  userPreferences: string[];
  actionItems: string[];
  emotionalTone: string;
  nextSteps: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

class ConversationSummarizer {
  /**
   * Generate AI-powered summary of conversation
   */
  async summarize(
    messages: Message[],
    options: { userId?: string; maxLength?: number } = {}
  ): Promise<ConversationSummary | null> {
    if (messages.length < 4) {
      return null; // Not enough to summarize
    }

    const { maxLength = 500 } = options;

    try {
      // Build conversation text
      const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
        .join("\n\n");

      const systemPrompt = `You are a conversation analysis expert. Analyze the conversation and provide a structured summary.

Extract:
1. Key factual information shared by the user
2. Topics discussed
3. User's goals or intentions
4. User's preferences expressed
5. Action items or next steps
6. Overall emotional tone

Respond in this JSON format:
{
  "overview": "Brief 1-2 sentence summary",
  "keyPoints": ["Key fact 1", "Key fact 2"],
  "topics": ["topic1", "topic2"],
  "userGoals": ["goal1", "goal2"],
  "userPreferences": ["preference1"],
  "actionItems": ["action1"],
  "emotionalTone": "positive|negative|neutral|mixed",
  "nextSteps": ["suggested follow-up"]
}`;

      const aiMessages: AIMessage[] = [
        { role: "user", content: `Please analyze this conversation:\n\n${conversationText}` }
      ];

      // Use a lightweight model for summarization if available
      const response = await aiClient.createCompletion(aiMessages, undefined, systemPrompt);
      
      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          overview: parsed.overview || "",
          keyPoints: parsed.keyPoints || [],
          topics: parsed.topics || [],
          userGoals: parsed.userGoals || [],
          userPreferences: parsed.userPreferences || [],
          actionItems: parsed.actionItems || [],
          emotionalTone: parsed.emotionalTone || "neutral",
          nextSteps: parsed.nextSteps || []
        };
      }

      return null;
    } catch (e) {
      console.warn("AI summarization failed:", e);
      return this.generateSimpleSummary(messages);
    }
  }

  /**
   * Generate simple fallback summary
   */
  private generateSimpleSummary(messages: Message[]): ConversationSummary {
    const userMessages = messages.filter(m => m.role === "user");
    const topics = this.extractTopics(messages);
    
    const preview = userMessages
      .slice(-3)
      .map(m => m.content.split(/[.!?]/, 1)[0].slice(0, 60))
      .join("; ");

    return {
      overview: `Discussed: ${preview}`,
      keyPoints: [],
      topics: [...new Set(topics)].slice(0, 5),
      userGoals: [],
      userPreferences: [],
      actionItems: [],
      emotionalTone: "neutral",
      nextSteps: []
    };
  }

  /**
   * Extract topics from messages
   */
  private extractTopics(messages: Message[]): string[] {
    const allText = messages.map(m => m.content).join(" ");
    const topics: string[] = [];

    const topicPatterns = [
      /\b(JavaScript|TypeScript|Python|Rust|Go|Java|React|Node\.js|Docker|Kubernetes|AWS)\b/gi,
      /\b(project|app|website|code|program|feature|bug|debug)\b/gi,
      /\b(work|job|career|company|team|meeting|interview)\b/gi,
      /\b(learn|study|course|book|tutorial|guide|documentation)\b/gi,
      /\b(health|exercise|gym|diet|sleep|meditation)\b/gi,
      /\b(travel|trip|vacation|flight|hotel|visit)\b/gi,
      /\b(family|friend|relationship|social|party)\b/gi,
      /\b(money|finance|budget|save|invest|salary)\b/gi
    ];

    for (const pattern of topicPatterns) {
      const matches = allText.match(pattern);
      if (matches) {
        topics.push(...matches.map(m => m.toLowerCase()));
      }
    }

    return [...new Set(topics)];
  }

  /**
   * Extract facts from conversation for memory storage
   */
  async extractFacts(
    messages: Message[]
  ): Promise<Array<{ type: string; content: string; confidence: number }>> {
    if (messages.length < 2) return [];

    try {
      const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`)
        .join("\n");

      const systemPrompt = `Extract factual information about the user from this conversation.

Look for:
- Personal information (name, location, job)
- Preferences (likes, dislikes)
- Goals and aspirations
- Important relationships
- Skills and expertise

Respond with JSON array:
[
  {"type": "fact|preference|goal|relationship", "content": "extracted fact", "confidence": 0.9}
]

Only include high-confidence facts explicitly stated by the user.`;

      const aiMessages: AIMessage[] = [
        { role: "user", content: conversationText }
      ];

      const response = await aiClient.createCompletion(aiMessages, undefined, systemPrompt);
      
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];
    } catch (e) {
      console.warn("Fact extraction failed:", e);
      return [];
    }
  }

  /**
   * Check if a conversation should be summarized
   */
  shouldSummarize(messages: Message[]): boolean {
    if (messages.length < 10) return false;
    
    // Check conversation length
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    return totalLength > 2000; // Summarize if conversation is substantial
  }

  /**
   * Generate topic-based summary for quick reference
   */
  async generateTopicSummary(
    messages: Message[],
    topic: string
  ): Promise<string | null> {
    const relevantMessages = messages.filter(m => 
      m.content.toLowerCase().includes(topic.toLowerCase())
    );

    if (relevantMessages.length < 2) return null;

    try {
      const conversationText = relevantMessages
        .map(m => `${m.role}: ${m.content.slice(0, 300)}`)
        .join("\n");

      const systemPrompt = `Summarize what was discussed about "${topic}" in 1-2 sentences.`;

      const aiMessages: AIMessage[] = [
        { role: "user", content: conversationText }
      ];

      const response = await aiClient.createCompletion(aiMessages, undefined, systemPrompt);
      return response.content.trim();
    } catch (e) {
      return null;
    }
  }
}

export const conversationSummarizer = new ConversationSummarizer();
