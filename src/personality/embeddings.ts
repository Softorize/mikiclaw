import { configManager } from "../config/manager.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Embedding Service for Semantic Memory Search
 * 
 * Supports multiple embedding providers:
 * - OpenAI (text-embedding-3-small)
 * - Local fallback (simple TF-IDF based)
 * 
 * Embeddings enable true semantic search - finding memories by meaning,
 * not just keywords.
 */

export interface EmbeddingVector {
  id: string;
  text: string;
  vector: number[];
  metadata: {
    type: string;
    userId?: string;
    timestamp: string;
    importance: number;
  };
}

interface EmbeddingCache {
  version: string;
  embeddings: EmbeddingVector[];
  lastUpdated: string;
}

const EMBEDDING_DIMENSION = 1536; // OpenAI text-embedding-3-small
const CACHE_VERSION = "1.0";

class EmbeddingService {
  private cacheDir: string;
  private cache: Map<string, EmbeddingVector> = new Map();
  private cacheLoaded: boolean = false;

  constructor() {
    this.cacheDir = join(configManager.getWorkspacePath(), "embeddings");
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    this.loadCache();
  }

  private getCachePath(): string {
    return join(this.cacheDir, "embeddings_cache.json");
  }

  private loadCache(): void {
    if (this.cacheLoaded) return;
    
    const cachePath = this.getCachePath();
    if (existsSync(cachePath)) {
      try {
        const content = readFileSync(cachePath, "utf-8");
        const data = JSON.parse(content) as EmbeddingCache;
        
        if (data.version === CACHE_VERSION) {
          for (const embedding of data.embeddings) {
            this.cache.set(embedding.id, embedding);
          }
          console.log(`📊 Loaded ${this.cache.size} embeddings from cache`);
        }
      } catch (e) {
        console.warn("Failed to load embedding cache:", e);
      }
    }
    this.cacheLoaded = true;
  }

  private saveCache(): void {
    const data: EmbeddingCache = {
      version: CACHE_VERSION,
      embeddings: Array.from(this.cache.values()),
      lastUpdated: new Date().toISOString()
    };

    try {
      writeFileSync(this.getCachePath(), JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save embedding cache:", e);
    }
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const config = configManager.load();
    
    // Try OpenAI first if configured
    if (config.ai?.providers?.openai?.apiKey) {
      try {
        return await this.generateOpenAIEmbedding(text);
      } catch (e) {
        console.warn("OpenAI embedding failed, falling back to local:", e);
      }
    }

    // Fallback to local embedding
    return this.generateLocalEmbedding(text);
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const config = configManager.load();
    const apiKey = config.ai?.providers?.openai?.apiKey;
    
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text.slice(0, 8000), // OpenAI has token limit
        model: "text-embedding-3-small"
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Generate local embedding using simple TF-IDF + hashing
   * Not as good as neural embeddings but works offline
   */
  private generateLocalEmbedding(text: string): number[] {
    // Simple bag-of-words with hashing trick
    const vector = new Array(384).fill(0); // Smaller dimension for local
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Hash-based feature extraction
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const weight = 1 + Math.log(1 + words.filter(w => w === word).length);
      
      // Simple hash function
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash = hash & hash; // Convert to 32bit integer
      }
      
      // Distribute across vector
      const index = Math.abs(hash) % vector.length;
      vector[index] += weight;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(v => v / magnitude);
    }
    return vector;
  }

  /**
   * Store embedding for a memory entry
   */
  async storeEmbedding(
    id: string,
    text: string,
    metadata: EmbeddingVector["metadata"]
  ): Promise<void> {
    // Check if already cached
    if (this.cache.has(id)) {
      return;
    }

    const vector = await this.generateEmbedding(text);
    
    const embedding: EmbeddingVector = {
      id,
      text: text.slice(0, 1000),
      vector,
      metadata
    };

    this.cache.set(id, embedding);
    
    // Save periodically (every 10 new embeddings)
    if (this.cache.size % 10 === 0) {
      this.saveCache();
    }
  }

  /**
   * Find semantically similar memories
   */
  async findSimilar(
    query: string,
    options: {
      userId?: string;
      topK?: number;
      minSimilarity?: number;
      type?: string;
    } = {}
  ): Promise<Array<{ id: string; text: string; similarity: number; metadata: EmbeddingVector["metadata"] }>> {
    const { userId, topK = 5, minSimilarity = 0.7, type } = options;

    // Generate query embedding
    const queryVector = await this.generateEmbedding(query);

    // Calculate similarity with all cached embeddings
    const similarities: Array<{ id: string; text: string; similarity: number; metadata: EmbeddingVector["metadata"] }> = [];

    for (const embedding of this.cache.values()) {
      // Filter by user if specified
      if (userId && embedding.metadata.userId && embedding.metadata.userId !== userId) {
        continue;
      }

      // Filter by type if specified
      if (type && embedding.metadata.type !== type) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryVector, embedding.vector);
      
      if (similarity >= minSimilarity) {
        similarities.push({
          id: embedding.id,
          text: embedding.text,
          similarity,
          metadata: embedding.metadata
        });
      }
    }

    // Sort by similarity and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async batchGenerateEmbeddings(
    items: Array<{ id: string; text: string; metadata: EmbeddingVector["metadata"] }>
  ): Promise<void> {
    console.log(`🔢 Generating embeddings for ${items.length} items...`);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (this.cache.has(item.id)) continue;

      try {
        await this.storeEmbedding(item.id, item.text, item.metadata);
        
        // Progress indicator
        if ((i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1}/${items.length}`);
        }
        
        // Small delay to avoid rate limiting
        if (i < items.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        console.warn(`Failed to generate embedding for ${item.id}:`, e);
      }
    }

    this.saveCache();
    console.log(`✅ Embeddings generation complete`);
  }

  /**
   * Remove embedding for a memory
   */
  removeEmbedding(id: string): void {
    this.cache.delete(id);
    this.saveCache();
  }

  /**
   * Clear all embeddings
   */
  clearCache(): void {
    this.cache.clear();
    const cachePath = this.getCachePath();
    if (existsSync(cachePath)) {
      const { unlinkSync } = require("node:fs");
      try {
        unlinkSync(cachePath);
      } catch {}
    }
  }

  /**
   * Get cache stats
   */
  getStats(): { count: number; lastUpdated?: string } {
    return {
      count: this.cache.size,
      lastUpdated: this.cache.size > 0 ? new Date().toISOString() : undefined
    };
  }

  /**
   * Rebuild embeddings for all memories
   */
  async rebuildEmbeddings(memories: Array<{ id: string; content: string; type: string; userId?: string; timestamp: string; importance: number }>): Promise<void> {
    console.log(`🔄 Rebuilding embeddings for ${memories.length} memories...`);
    
    this.clearCache();
    
    const items = memories.map(m => ({
      id: m.id,
      text: m.content,
      metadata: {
        type: m.type,
        userId: m.userId,
        timestamp: m.timestamp,
        importance: m.importance
      }
    }));

    await this.batchGenerateEmbeddings(items);
  }
}

export const embeddingService = new EmbeddingService();
