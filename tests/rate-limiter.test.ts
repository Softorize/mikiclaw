import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rateLimiter } from '../src/utils/rate_limiter.js';
import { configManager } from '../src/config/manager.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Rate Limiter', () => {
  const rateLimitPath = join(process.env.MIKICLAW_HOME!, 'rate_limits.json');

  beforeEach(() => {
    rateLimiter.resetAll();

    configManager.save({
      rateLimit: {
        enabled: true,
        maxRequestsPerMinute: 5
      },
      security: {
        encryptCredentials: false
      }
    });
  });

  afterEach(async () => {
    rateLimiter.resetAll();
    await rateLimiter.flushPendingWrites();
  });

  describe('isAllowed', () => {
    it('should allow requests under the limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed('user1')).toBe(true);
      }
    });

    it('should reject requests over the limit', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user2');
      }

      expect(rateLimiter.isAllowed('user2')).toBe(false);
    });

    it('should track limits per user', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user1');
      }

      expect(rateLimiter.isAllowed('user1')).toBe(false);
      expect(rateLimiter.isAllowed('user2')).toBe(true);
    });

    it('should respect disabled rate limiting', () => {
      configManager.save({
        rateLimit: {
          enabled: false,
          maxRequestsPerMinute: 5
        },
        security: {
          encryptCredentials: false
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
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed('user5');
      }

      expect(rateLimiter.isAllowed('user5')).toBe(false);

      rateLimiter.reset('user5');

      expect(rateLimiter.isAllowed('user5')).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should save rate limit data to disk', async () => {
      rateLimiter.isAllowed('user6');
      await rateLimiter.flushPendingWrites();

      expect(existsSync(rateLimitPath)).toBe(true);
    });
  });
});
