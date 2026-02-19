import { configManager } from "../config/manager.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccess: number;
}

interface RateLimitData {
  version: number;
  entries: Record<string, RateLimitEntry>;
}

const RATE_LIMIT_FILE = "rate_limits.json";
const DATA_VERSION = 1;
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes max age for stale entries

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private dataPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    const dataDir = join(homedir(), ".mikiclaw");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.dataPath = join(dataDir, RATE_LIMIT_FILE);
    
    // Load existing data
    this.loadData();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private loadData(): void {
    if (!existsSync(this.dataPath)) {
      return;
    }

    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const data: RateLimitData = JSON.parse(raw);

      if (data.version !== DATA_VERSION) {
        // Incompatible version, start fresh
        this.limits = new Map();
        return;
      }

      // Convert from plain object to Map
      this.limits = new Map(Object.entries(data.entries || {}));
    } catch (e) {
      // File corrupted, start fresh
      this.limits = new Map();
    }
  }

  private saveData(): void {
    // Debounce saves to avoid excessive I/O
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        const data: RateLimitData = {
          version: DATA_VERSION,
          entries: Object.fromEntries(this.limits)
        };
        writeFileSync(this.dataPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      } catch (e) {
        // Ignore save errors, data is in memory
      }
      this.saveTimeout = null;
    }, 1000);
  }

  isAllowed(userId: string): boolean {
    const config = configManager.load();
    if (!config.rateLimit?.enabled) {
      return true;
    }

    const maxRequests = config.rateLimit?.maxRequestsPerMinute || 20;
    const now = Date.now();
    const key = `ratelimit:${userId}`;

    let entry = this.limits.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + 60000,
        lastAccess: now
      };
      this.limits.set(key, entry);
    }

    entry.count++;
    entry.lastAccess = now;

    // Save to disk periodically
    this.saveData();

    if (entry.count > maxRequests) {
      return false;
    }

    return true;
  }

  getRemainingRequests(userId: string): number {
    const config = configManager.load();
    const maxRequests = config.rateLimit?.maxRequestsPerMinute || 20;
    const key = `ratelimit:${userId}`;
    const entry = this.limits.get(key);

    if (!entry) {
      return maxRequests;
    }

    return Math.max(0, maxRequests - entry.count);
  }

  getRateLimitInfo(userId: string): {
    remaining: number;
    resetTime: number;
    limit: number;
  } {
    const config = configManager.load();
    const maxRequests = config.rateLimit?.maxRequestsPerMinute || 20;
    const key = `ratelimit:${userId}`;
    const entry = this.limits.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetTime) {
      return {
        remaining: maxRequests,
        resetTime: now + 60000,
        limit: maxRequests
      };
    }

    return {
      remaining: Math.max(0, maxRequests - entry.count),
      resetTime: entry.resetTime,
      limit: maxRequests
    };
  }

  private cleanup(): void {
    const now = Date.now();
    let changed = false;

    for (const [key, entry] of this.limits.entries()) {
      // Remove entries that are older than MAX_AGE_MS
      if (now - entry.lastAccess > MAX_AGE_MS) {
        this.limits.delete(key);
        changed = true;
      }
    }

    if (changed) {
      this.saveData();
    }
  }

  reset(userId: string): void {
    const key = `ratelimit:${userId}`;
    this.limits.delete(key);
    this.saveData();
  }

  resetAll(): void {
    this.limits.clear();
    this.saveData();
  }

  destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    clearInterval(this.cleanupInterval);
    this.saveData();
    this.limits.clear();
  }
}

export const rateLimiter = new RateLimiter();
