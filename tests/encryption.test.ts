import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, validateKeyFile } from '../src/config/encryption.js';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('Encryption', () => {
  const keyPath = join(homedir(), '.mikiclaw_key');

  afterEach(() => {
    // Clean up test key file if created
    if (existsSync(keyPath)) {
      try {
        unlinkSync(keyPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const originalText = 'sk-ant-test-api-key-12345';
      const encrypted = encrypt(originalText);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(originalText);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const text = 'test-secret';
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should include salt, iv, and tag in encrypted format', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      
      expect(parts).toHaveLength(4); // salt:iv:tag:encrypted
      expect(parts[0]).toHaveLength(64); // 32 bytes salt = 64 hex chars
      expect(parts[1]).toHaveLength(32); // 16 bytes IV = 32 hex chars
      expect(parts[2]).toHaveLength(32); // 16 bytes tag = 32 hex chars
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted format');
      expect(() => decrypt('a:b:c')).toThrow('Invalid encrypted format');
    });

    it('should handle unicode characters', () => {
      const originalText = '你好，世界！🌍';
      const encrypted = encrypt(originalText);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(originalText);
    });

    it('should handle empty string', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe('');
    });
  });

  describe('validateKeyFile', () => {
    it('should return valid when key file does not exist', () => {
      // Ensure key file doesn't exist
      if (existsSync(keyPath)) {
        unlinkSync(keyPath);
      }
      
      const result = validateKeyFile();
      expect(result.valid).toBe(true);
      expect(result.message).toContain('will be generated');
    });
  });
});
