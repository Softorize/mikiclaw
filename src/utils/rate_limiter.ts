import { configManager } from "../config/manager.js";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
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
        resetTime: now + 60000
      };
      this.limits.set(key, entry);
    }

    entry.count++;

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

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

export const rateLimiter = new RateLimiter();
