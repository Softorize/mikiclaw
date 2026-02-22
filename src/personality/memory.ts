import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { UserProfiler } from "./user_profiler.js";
import { embeddingService } from "./embeddings.js";

// Enhanced memory types for better organization
type MemoryType = 
  | "fact"           // Basic facts (name, location, work)
  | "preference"     // Likes/dislikes
  | "goal"           // Short/long term goals
  | "relationship"   // Connections to people/orgs
  | "event"          // Specific occurrences
  | "pattern"        // Behavioral patterns
  | "emotion"        // Emotional states during conversations
  | "knowledge_gap"  // Things user is learning
  | "conversation"   // Conversation summaries
  | "tool_usage"     // Tool usage patterns
  | "user_style"     // Communication style
  | "learning";      // Learned insights

interface MemoryEntry {
  id: string;
  timestamp: string;
  type: MemoryType;
  content: string;
  importance: number;
  tags: string[];
  userId?: string;
  
  // Enhanced fields for better connections
  entities?: string[];           // Extracted entities (people, places, topics)
  relatedEntryIds?: string[];    // Links to related memories
  sentiment?: number;            // -1 to 1 emotional valence
  source?: string;               // Where this memory came from
  confidence?: number;           // How sure we are about this memory (0-1)
}

const MAX_CONTENT_LENGTH = 10000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;
const VALID_TYPES: Set<MemoryType> = new Set([
  "fact", "preference", "goal", "relationship", "event", "pattern", 
  "emotion", "knowledge_gap", "conversation", "tool_usage", "user_style", "learning"
]);

// Common entity patterns for extraction
const ENTITY_PATTERNS = {
  person: [
    /(?:my|his|her|their)\s+(?:friend|brother|sister|mom|dad|mother|father|wife|husband|partner|colleague|boss)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|was)\s+(?:my|his|her|their)/gi
  ],
  organization: [
    /\b(Google|Microsoft|Apple|Amazon|Meta|Netflix|Spotify|Uber|Airbnb|Twitter|LinkedIn)\b/gi,
    /\b\w+\s+(?:Inc|Corp|Ltd|LLC|Company|Startup|Agency)\b/gi,
    /(?:work\s+(?:at|for)|employed\s+by)\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)/gi
  ],
  location: [
    /\b(New York|San Francisco|Los Angeles|London|Paris|Tokyo|Berlin|Sydney|Toronto|Singapore)\b/gi,
    /(?:live\s+in|from|located\s+in|moving\s+to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi
  ],
  technology: [
    /\b(JavaScript|TypeScript|Python|Rust|Go|Java|C\+\+|React|Vue|Angular|Node\.js|Docker|Kubernetes)\b/gi,
    /\b(AI|ML|blockchain|web3|cloud|serverless)\b/gi
  ],
  topic: [
    /(?:interested\s+in|learning|studying|passionate\s+about)\s+(\w+(?:\s+\w+){0,3})/gi,
    /(?:working\s+on|building|creating)\s+(?:a\s+)?(\w+(?:\s+\w+){0,3})/gi
  ]
};

class MemorySystem {
  private memoryPath: string;
  private lastInteractionTime: number = Date.now();
  private memoryCache: MemoryEntry[] | null = null;
  private userProfilers: Map<string, UserProfiler> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map(); // entity -> memory IDs

  constructor() {
    this.memoryPath = join(configManager.getWorkspacePath(), "MEMORY.md");
    this.load(); // Build entity index on startup
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
      this.buildEntityIndex([]);
      return [];
    }

    try {
      const content = readFileSync(this.memoryPath, "utf-8");
      this.memoryCache = this.parseMemoryFile(content);
      this.buildEntityIndex(this.memoryCache);
      return this.memoryCache;
    } catch (e) {
      console.warn("Failed to load memory:", e);
      this.memoryCache = [];
      this.buildEntityIndex([]);
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
    this.buildEntityIndex(entries);
  }

  /**
   * Build entity-to-memory index for fast lookup
   */
  private buildEntityIndex(entries: MemoryEntry[]): void {
    this.entityIndex.clear();
    for (const entry of entries) {
      if (entry.entities) {
        for (const entity of entry.entities) {
          const normalized = entity.toLowerCase();
          if (!this.entityIndex.has(normalized)) {
            this.entityIndex.set(normalized, new Set());
          }
          this.entityIndex.get(normalized)!.add(entry.id);
        }
      }
    }
  }

  addEntry(entry: Omit<MemoryEntry, "timestamp" | "id">): void {
    const entries = this.load();
    
    // Generate unique ID
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate entry
    const validatedEntry = this.validateEntry({ ...entry, id });
    if (!validatedEntry) {
      console.warn("Invalid memory entry rejected");
      return;
    }

    // Extract entities if not provided
    if (!validatedEntry.entities) {
      validatedEntry.entities = this.extractEntities(validatedEntry.content);
    }

    // Find and link related memories
    validatedEntry.relatedEntryIds = this.findRelatedMemories(validatedEntry, entries);

    const fullEntry: MemoryEntry = {
      ...validatedEntry,
      timestamp: new Date().toISOString()
    };

    entries.push(fullEntry);

    // Consolidate if too many
    if (entries.length > 1000) {
      this.consolidateMemories(entries);
    }

    this.save(entries);
    
    // Update entity index
    if (fullEntry.entities) {
      for (const entity of fullEntry.entities) {
        const normalized = entity.toLowerCase();
        if (!this.entityIndex.has(normalized)) {
          this.entityIndex.set(normalized, new Set());
        }
        this.entityIndex.get(normalized)!.add(fullEntry.id);
      }
    }
    
    // Generate embedding asynchronously (don't block)
    this.generateEmbeddingForEntry(fullEntry).catch(e => {
      console.warn("Failed to generate embedding:", e);
    });
  }

  /**
   * Generate embedding for a memory entry
   */
  private async generateEmbeddingForEntry(entry: MemoryEntry): Promise<void> {
    try {
      await embeddingService.storeEmbedding(entry.id, entry.content, {
        type: entry.type,
        userId: entry.userId,
        timestamp: entry.timestamp,
        importance: entry.importance
      });
    } catch (e) {
      console.warn(`Failed to generate embedding for ${entry.id}:`, e);
    }
  }

  /**
   * Extract entities from text using patterns and heuristics
   */
  extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          const entity = (match[1] || match[0]).trim();
          if (entity && entity.length > 1 && !entities.includes(entity)) {
            entities.push(entity);
          }
        }
      }
    }
    
    // Additional simple NER
    // Capitalized phrases (potential proper nouns)
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    for (const noun of properNouns) {
      // Filter out common words
      const commonWords = ["The", "A", "An", "I", "You", "He", "She", "It", "We", "They"];
      if (!commonWords.includes(noun) && !entities.includes(noun)) {
        entities.push(noun);
      }
    }
    
    return entities.slice(0, 20); // Limit entities
  }

  /**
   * Find memories related to a new entry based on entities and content similarity
   */
  private findRelatedMemories(newEntry: MemoryEntry, allEntries: MemoryEntry[]): string[] {
    const related: string[] = [];
    const newEntities = new Set((newEntry.entities || []).map(e => e.toLowerCase()));
    
    for (const entry of allEntries) {
      if (entry.id === newEntry.id) continue;
      
      // Check entity overlap
      const entryEntities = new Set((entry.entities || []).map(e => e.toLowerCase()));
      const sharedEntities = [...newEntities].filter(e => entryEntities.has(e));
      
      if (sharedEntities.length > 0) {
        related.push(entry.id);
        continue;
      }
      
      // Check content similarity (simple word overlap)
      const newWords = new Set(newEntry.content.toLowerCase().split(/\s+/));
      const entryWords = new Set(entry.content.toLowerCase().split(/\s+/));
      const sharedWords = [...newWords].filter(w => entryWords.has(w) && w.length > 4);
      
      if (sharedWords.length >= 3) {
        related.push(entry.id);
      }
    }
    
    return related.slice(0, 5); // Limit related memories
  }

  private validateEntry(entry: Partial<MemoryEntry>): MemoryEntry | null {
    // Validate type
    if (!entry.type || !VALID_TYPES.has(entry.type as MemoryType)) {
      return null;
    }

    // Validate content
    if (!entry.content || typeof entry.content !== "string") {
      return null;
    }

    // Truncate content if too long
    const content = entry.content.slice(0, MAX_CONTENT_LENGTH);

    // Sanitize content
    const sanitizedContent = content
      .replace(/^---/gm, '')
      .replace(/^\s*#/gm, '')
      .replace(/`{3,}/g, '')
      .trim();

    // Validate importance
    const importance = Math.max(1, Math.min(10, entry.importance || 1));

    // Validate and sanitize tags
    const tags = (entry.tags || [])
      .slice(0, MAX_TAGS)
      .map(tag => String(tag).slice(0, MAX_TAG_LENGTH).replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter(tag => tag.length > 0);

    return {
      id: entry.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: entry.type as MemoryType,
      content: sanitizedContent,
      importance,
      tags,
      timestamp: "", // Will be set by caller
      userId: entry.userId,
      entities: entry.entities,
      relatedEntryIds: entry.relatedEntryIds,
      sentiment: entry.sentiment,
      source: entry.source,
      confidence: entry.confidence || 1.0
    };
  }

  /**
   * Search memories by query (keywords)
   */
  search(query: string, userId?: string): MemoryEntry[] {
    const entries = this.load();
    const lowerQuery = query.toLowerCase().slice(0, 500);
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

    return entries
      .filter(entry => {
        // Filter by user if specified
        if (userId && entry.userId && entry.userId !== userId) {
          return false;
        }
        
        const lowerContent = entry.content.toLowerCase();
        const lowerTags = entry.tags.map(t => t.toLowerCase());
        
        // Check direct match
        if (lowerContent.includes(lowerQuery) || lowerTags.some(t => t.includes(lowerQuery))) {
          return true;
        }
        
        // Check word-level match
        const matchCount = queryWords.filter(w => 
          lowerContent.includes(w) || lowerTags.some(t => t.includes(w))
        ).length;
        
        return matchCount >= Math.max(1, queryWords.length * 0.5);
      })
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * Get memories that share entities with the query
   */
  searchByEntity(query: string): MemoryEntry[] {
    const entries = this.load();
    const queryEntities = this.extractEntities(query).map(e => e.toLowerCase());
    
    if (queryEntities.length === 0) return [];
    
    const relatedIds = new Set<string>();
    
    for (const entity of queryEntities) {
      const ids = this.entityIndex.get(entity);
      if (ids) {
        ids.forEach(id => relatedIds.add(id));
      }
    }
    
    return entries
      .filter(e => relatedIds.has(e.id))
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * Semantic search using embeddings
   * Finds memories similar in meaning, not just keywords
   */
  async semanticSearch(
    query: string, 
    options: { userId?: string; topK?: number; minSimilarity?: number } = {}
  ): Promise<MemoryEntry[]> {
    const entries = this.load();
    const { userId, topK = 5, minSimilarity = 0.75 } = options;

    try {
      const similar = await embeddingService.findSimilar(query, {
        userId,
        topK,
        minSimilarity
      });

      // Map back to full entries
      return similar
        .map(s => entries.find(e => e.id === s.id))
        .filter((e): e is MemoryEntry => e !== undefined)
        .sort((a, b) => b.importance - a.importance);
    } catch (e) {
      console.warn("Semantic search failed, falling back to keyword search:", e);
      return this.search(query, userId);
    }
  }

  /**
   * Get connected context - combines direct search, entity search, semantic search, and related memories
   */
  async getConnectedContext(userMessage: string, userId?: string): Promise<string> {
    const entries = this.load();
    
    // 1. Direct keyword search
    const directMatches = this.search(userMessage, userId);
    
    // 2. Entity-based search
    const entityMatches = this.searchByEntity(userMessage);
    
    // 3. Semantic search (async)
    let semanticMatches: MemoryEntry[] = [];
    try {
      semanticMatches = await this.semanticSearch(userMessage, { userId, topK: 5 });
    } catch (e) {
      console.warn("Semantic search failed:", e);
    }
    
    // 4. Get related memories (2-hop connections)
    const allMatches = new Map<string, MemoryEntry>();
    
    for (const entry of [...directMatches.slice(0, 3), ...entityMatches.slice(0, 3), ...semanticMatches.slice(0, 3)]) {
      if (!entry) continue;
      allMatches.set(entry.id, entry);
      
      // Add related memories (1-hop)
      if (entry.relatedEntryIds) {
        for (const relatedId of entry.relatedEntryIds.slice(0, 2)) {
          const related = entries.find(e => e.id === relatedId);
          if (related && (!related.userId || related.userId === userId)) {
            allMatches.set(relatedId, related);
          }
        }
      }
    }
    
    // Convert to array and filter by user
    let contextEntries = Array.from(allMatches.values());
    if (userId) {
      contextEntries = contextEntries.filter(e => !e.userId || e.userId === userId);
    }
    
    // Sort by importance and recency
    contextEntries.sort((a, b) => {
      const importanceDiff = b.importance - a.importance;
      if (importanceDiff !== 0) return importanceDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    
    if (contextEntries.length === 0) return "";

    // Format with connection indicators
    return contextEntries
      .slice(0, 8)
      .map(e => {
        let line = `- ${e.content}`;
        if (e.entities && e.entities.length > 0) {
          line += ` [related to: ${e.entities.slice(0, 3).join(", ")}]`;
        }
        return line;
      })
      .join("\n");
  }

  /**
   * Legacy method for backward compatibility
   */
  async getRelevantContext(userMessage: string, userId?: string): Promise<string> {
    return this.getConnectedContext(userMessage, userId);
  }

  /**
   * Get personalized context for a specific user
   */
  async getPersonalizedContext(userId: string, userMessage: string): Promise<string> {
    const profiler = this.getUserProfiler(userId);
    const profile = profiler.loadProfile();

    const contextParts: string[] = [];

    // Get user's name from facts
    const entries = this.load();
    const userNameFact = entries.find(e =>
      e.userId === userId &&
      e.type === "fact" &&
      e.content.toLowerCase().includes("name is")
    );

    if (userNameFact) {
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

    // Add connected memories (this is the key improvement)
    const connectedMemories = await this.getConnectedContext(userMessage, userId);
    if (connectedMemories) {
      contextParts.push("# Relevant Context\n" + connectedMemories);
    }

    // Add user facts with high importance
    const userFacts = entries
      .filter(m => m.userId === userId && m.type === "fact" && m.importance >= 5)
      .slice(0, 10)
      .map(m => `- ${m.content}`)
      .join("\n");
    if (userFacts) {
      contextParts.push("# User Facts\n" + userFacts);
    }

    // Add user preferences with high importance
    const userPrefs = entries
      .filter(m => m.userId === userId && m.type === "preference" && m.importance >= 5)
      .slice(0, 5)
      .map(m => `- ${m.content}`)
      .join("\n");
    if (userPrefs) {
      contextParts.push("# User Preferences\n" + userPrefs);
    }

    // Add goals if any
    const userGoals = entries
      .filter(m => m.userId === userId && m.type === "goal")
      .slice(0, 5)
      .map(m => `- ${m.content}`)
      .join("\n");
    if (userGoals) {
      contextParts.push("# User Goals\n" + userGoals);
    }

    return contextParts.join("\n\n");
  }

  consolidateConversations(conversationSummary: string, userId?: string): void {
    const sanitized = conversationSummary
      .slice(0, MAX_CONTENT_LENGTH)
      .replace(/^---/gm, '')
      .trim();

    this.addEntry({
      type: "conversation",
      content: sanitized,
      importance: 3,
      tags: ["conversation", "summary"],
      userId,
      source: "consolidation"
    });
  }

  recordToolUsage(toolName: string, command: string, userId?: string): void {
    this.addEntry({
      type: "tool_usage",
      content: `Used ${toolName}: ${command.slice(0, 500)}`,
      importance: 2,
      tags: ["tool", toolName.slice(0, 50)],
      userId,
      source: "tool_execution"
    });
  }

  learnUserPreference(key: string, value: string, userId?: string): void {
    this.addEntry({
      type: "preference",
      content: `User prefers ${key.slice(0, 100)}: ${value.slice(0, 500)}`,
      importance: 7,
      tags: ["preference", key.slice(0, 50)],
      userId,
      source: "user_statement"
    });
  }

  /**
   * Extract and store comprehensive user facts
   */
  extractUserFacts(userId: string, userMessage: string, assistantResponse: string): void {
    const lowerMessage = userMessage.toLowerCase();
    const entities = this.extractEntities(userMessage);
    
    // Enhanced name extraction
    const namePatterns = [
      /(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:this is|it's)\s+([A-Z][a-z]+)/i,
      /^([A-Z][a-z]+)\s+here/i
    ];

    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        this.addEntry({
          type: "fact",
          content: `User's name is ${name}`,
          importance: 10,
          tags: ["name", "identity"],
          userId,
          entities: [name],
          source: "user_introduction"
        });
        break;
      }
    }

    // Enhanced location extraction
    const locationPatterns = [
      /(?:I live in|I'm from|I am from|located in|moving to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:based\s+in|from)\s+([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?)/i
    ];

    for (const pattern of locationPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const location = match[1];
        this.addEntry({
          type: "fact",
          content: `User lives in/is from ${location}`,
          importance: 8,
          tags: ["location", "identity"],
          userId,
          entities: [location],
          source: "user_statement"
        });
        break;
      }
    }

    // Work/Occupation extraction
    const workPatterns = [
      /(?:I work as|I'm a|I am a|I work for|employed as)\s+([a-zA-Z\s]+?(?:at|for)\s+[A-Z]\w+)/i,
      /(?:work as|working as)\s+(?:a\s+)?([a-zA-Z\s]+)/i,
      /(?:I'm|I am)\s+(?:a\s+)?(developer|engineer|designer|manager|student|freelancer|entrepreneur)/i
    ];

    for (const pattern of workPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const work = match[1].trim();
        this.addEntry({
          type: "fact",
          content: `User works as ${work}`,
          importance: 8,
          tags: ["work", "occupation"],
          userId,
          entities: entities.filter(e => work.toLowerCase().includes(e.toLowerCase())),
          source: "user_statement"
        });
      }
    }

    // Goal detection
    const goalPatterns = [
      /(?:I want to|my goal is|I'm trying to|planning to)\s+(.+?)(?:\.|,|;|$)/i,
      /(?:want to learn|interested in learning)\s+(.+?)(?:\.|,|;|$)/i
    ];

    for (const pattern of goalPatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const goal = match[1].trim().slice(0, 200);
        this.addEntry({
          type: "goal",
          content: `User wants to ${goal}`,
          importance: 7,
          tags: ["goal", "aspiration"],
          userId,
          entities: entities.filter(e => goal.toLowerCase().includes(e.toLowerCase())),
          source: "user_statement"
        });
      }
    }

    // Preference detection (likes)
    const preferencePatterns = [
      /(?:I like|I love|I prefer|I enjoy|I'm a fan of)\s+(.+?)(?:\.|,|;|because|but|$)/i
    ];

    for (const pattern of preferencePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const preference = match[1].trim().slice(0, 150);
        this.addEntry({
          type: "preference",
          content: `User likes: ${preference}`,
          importance: 6,
          tags: ["preference", "interest"],
          userId,
          entities: entities.filter(e => preference.toLowerCase().includes(e.toLowerCase())),
          source: "user_statement"
        });
      }
    }

    // Dislike detection
    const dislikePatterns = [
      /(?:I hate|I dislike|I don't like|I can't stand)\s+(.+?)(?:\.|,|;|$)/i
    ];

    for (const pattern of dislikePatterns) {
      const match = userMessage.match(pattern);
      if (match && match[1]) {
        const dislike = match[1].trim().slice(0, 150);
        this.addEntry({
          type: "preference",
          content: `User dislikes: ${dislike}`,
          importance: 7,
          tags: ["preference", "dislike"],
          userId,
          entities: entities.filter(e => dislike.toLowerCase().includes(e.toLowerCase())),
          source: "user_statement"
        });
      }
    }

    // Relationship detection
    const relationshipPatterns = [
      /(?:my|his|her)\s+(\w+)\s+(?:is|works as)\s+([A-Z][a-z]+)/i,
      /(?:married to|dating|partner is)\s+([A-Z][a-z]+)/i
    ];

    for (const pattern of relationshipPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        const relationship = match[0];
        this.addEntry({
          type: "relationship",
          content: `User mentioned: ${relationship}`,
          importance: 7,
          tags: ["relationship", "personal"],
          userId,
          entities: entities.filter(e => relationship.toLowerCase().includes(e.toLowerCase())),
          source: "user_statement"
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
      importance: 3,
      tags: ["interaction", "learning"],
      userId,
      source: "interaction"
    });

    // Detect and store user preferences from message
    this.detectAndStorePreferences(userId, userMessage);

    // Store tool usage pattern if tools were used
    if (toolsUsed && toolsUsed.length > 0) {
      this.addEntry({
        type: "pattern",
        content: `User requested help with: ${toolsUsed.join(", ")}`,
        importance: 4,
        tags: ["pattern", "tool_usage", ...toolsUsed],
        userId,
        source: "interaction"
      });
    }
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

  trackInteraction(chatId: number): void {
    this.lastInteractionTime = Date.now();
  }

  getIdleTime(): number {
    return Date.now() - this.lastInteractionTime;
  }

  clear(): void {
    this.memoryCache = [];
    this.entityIndex.clear();
    this.save([]);
  }

  /**
   * Consolidate and compress old memories
   */
  consolidateMemories(entries: MemoryEntry[]): void {
    // Group by type and find patterns
    const conversations = entries.filter(e => e.type === "conversation");
    
    // If too many conversations, keep only high importance ones
    if (conversations.length > 100) {
      const kept = conversations
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 50);
      
      // Remove old low-importance conversations
      const keptIds = new Set(kept.map(e => e.id));
      const filtered = entries.filter(e => e.type !== "conversation" || keptIds.has(e.id));
      entries.length = 0;
      entries.push(...filtered);
    }

    // Decay importance of old entries over time
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryTime = new Date(entry.timestamp).getTime();
      const age = now - entryTime;

      if (age > thirtyDays) {
        const decay = Math.floor(age / thirtyDays);
        entry.importance = Math.max(1, entry.importance - decay);
      }
    }

    // Remove very low importance entries if too many
    if (entries.length > 1000) {
      entries.sort((a, b) => b.importance - a.importance);
      entries.splice(500);
    }
  }

  private parseMemoryFile(content: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    
    const blocks = content.split(/^##\s+/m).filter(Boolean);

    for (const block of blocks) {
      try {
        const entry = this.parseEntryBlock(block);
        if (entry) {
          entries.push(entry);
        }
      } catch (e) {
        console.warn("Skipping malformed memory entry");
      }
    }

    return entries;
  }

  private parseEntryBlock(block: string): MemoryEntry | null {
    const lines = block.split("\n");
    
    const typeLine = lines[0]?.trim();
    const typeMatch = typeLine?.match(/^-?\s*type:\s*(\w+)/);
    
    if (!typeMatch || !VALID_TYPES.has(typeMatch[1] as MemoryType)) {
      return null;
    }

    const type = typeMatch[1] as MemoryType;

    const contentMatch = block.match(/^-?\s*content:\s*(.+?)(?=\n-|$)/s);
    const importanceMatch = block.match(/^-?\s*importance:\s*(\d+)/);
    const tagsMatch = block.match(/^-?\s*tags:\s*\[([^\]]*)\]/);
    const timestampMatch = block.match(/^-?\s*timestamp:\s*(.+)/);
    const idMatch = block.match(/^-?\s*id:\s*(.+)/);
    const userIdMatch = block.match(/^-?\s*userId:\s*(.+)/);
    const entitiesMatch = block.match(/^-?\s*entities:\s*\[([^\]]*)\]/);
    const relatedIdsMatch = block.match(/^-?\s*relatedEntryIds:\s*\[([^\]]*)\]/);

    let content = contentMatch?.[1]?.trim() || "";
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.slice(0, MAX_CONTENT_LENGTH);
    }

    const importance = importanceMatch 
      ? Math.max(1, Math.min(10, parseInt(importanceMatch[1], 10) || 1))
      : 1;

    let tags: string[] = [];
    if (tagsMatch?.[1]) {
      tags = tagsMatch[1]
        .split(",")
        .map(t => t.trim().slice(0, MAX_TAG_LENGTH).replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(t => t.length > 0)
        .slice(0, MAX_TAGS);
    }

    let entities: string[] | undefined;
    if (entitiesMatch?.[1]) {
      entities = entitiesMatch[1]
        .split(",")
        .map(e => e.trim())
        .filter(e => e.length > 0);
    }

    let relatedEntryIds: string[] | undefined;
    if (relatedIdsMatch?.[1]) {
      relatedEntryIds = relatedIdsMatch[1]
        .split(",")
        .map(id => id.trim())
        .filter(id => id.length > 0);
    }

    let timestamp = timestampMatch?.[1]?.trim() || new Date().toISOString();
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        timestamp = new Date().toISOString();
      }
    } catch {
      timestamp = new Date().toISOString();
    }

    return { 
      id: idMatch?.[1]?.trim() || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type, 
      content, 
      importance, 
      tags, 
      timestamp,
      userId: userIdMatch?.[1]?.trim() || undefined,
      entities,
      relatedEntryIds
    };
  }

  private serializeMemory(entries: MemoryEntry[]): string {
    let content = "# Memory\n\n";
    content += "Long-term memory for the agent.\n\n";

    const sorted = entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    for (const entry of sorted) {
      content += `## ${entry.type}\n`;
      content += `- id: ${entry.id}\n`;
      content += `- timestamp: ${this.escapeValue(entry.timestamp)}\n`;
      content += `- type: ${entry.type}\n`;
      content += `- content: ${this.escapeValue(entry.content)}\n`;
      content += `- importance: ${entry.importance}\n`;
      content += `- tags: [${entry.tags.map(t => this.escapeValue(t)).join(", ")}]\n`;
      if (entry.userId) {
        content += `- userId: ${entry.userId}\n`;
      }
      if (entry.entities && entry.entities.length > 0) {
        content += `- entities: [${entry.entities.map(e => this.escapeValue(e)).join(", ")}]\n`;
      }
      if (entry.relatedEntryIds && entry.relatedEntryIds.length > 0) {
        content += `- relatedEntryIds: [${entry.relatedEntryIds.join(", ")}]\n`;
      }
      content += "\n";
    }

    return content;
  }

  private escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/^---/, '\\-\\-\\-');
  }
}

export const memorySystem = new MemorySystem();
