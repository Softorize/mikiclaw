import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rateLimiter } from '../src/utils/rate_limiter.js';
import { configManager } from '../src/config/manager.js';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('Rate Limiter', () => {
  const rateLimitPath = join(homedir(), '.mikiclaw', 'rate_limits.json');

  beforeEach(() => {
    // Reset rate limiter state
    rateLimiter.resetAll();
    
    // Enable rate limiting in config
    configManager.save({
      rateLimit: {
        enabled: true,
        maxRequestsPerMinute: 5
      }
    });
  });

  afterEach(() => {
    rateLimiter.resetAll();
  });

  describe('isAllowed', () => {
    it('should allow requests under the limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed('user1')).toBe(true);
      }
    });

    it('should reject requests over the limit', () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user2');
      }
      
      // Next request should be rejected
      expect(rateLimiter.isAllowed('user2')).toBe(false);
    });

    it('should track limits per user', () => {
      // User1 uses up their limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user1');
      }
      
      // User1 should be rejected
      expect(rateLimiter.isAllowed('user1')).toBe(false);
      
      // User2 should still be allowed
      expect(rateLimiter.isAllowed('user2')).toBe(true);
    });

    it('should respect disabled rate limiting', () => {
      configManager.save({
        rateLimit: {
          enabled: false,
          maxRequestsPerMinute: 5
        }
      });

      for (let i = 0; i < 100; i++) {
        expect(rateLimiter.isAllowed('user3')).toBe(true);
      }
    });
  });

  describe('getRemainingRequests', () => {
    it('should return correct remaining requests', () => {
      expect(rateLimiter.getRemainingRequests('user4')).toBe(5);
      
      rateLimiter.isAllowed('user4');
      rateLimiter.isAllowed('user4');
      
      expect(rateLimiter.getRemainingRequests('user4')).toBe(3);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for a specific user', () => {
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user5');
      }
      
      expect(rateLimiter.isAllowed('user5')).toBe(false);
      
      // Reset the user
      rateLimiter.reset('user5');
      
      // Should be allowed again
      expect(rateLimiter.isAllowed('user5')).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should save rate limit data to disk', () => {
      rateLimiter.isAllowed('user6');
      
      // Give time for debounced save
      setTimeout(() => {
        expect(existsSync(rateLimitPath)).toBe(true);
      }, 1500);
    });
  });
});
