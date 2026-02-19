import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizePath, validateCommand, validatePattern, validateUrl } from '../src/utils/validation.js';

describe('Validation Utils', () => {
  describe('sanitizePath', () => {
    it('should reject null bytes in path', () => {
      const result = sanitizePath('/path/to/\0file');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('null bytes');
    });

    it('should reject path traversal attempts', () => {
      const result = sanitizePath('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject access to sensitive paths', () => {
      const sensitivePaths = [
        'proc/self/environ',
        'etc/shadow',
        'etc/passwd',
        'dev/null',
        '.ssh/id_rsa',
        '.gnupg/secring.gpg',
        '.aws/credentials',
        '.kube/config'
      ];

      for (const path of sensitivePaths) {
        const result = sanitizePath(path);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('sensitive');
      }
    });

    it('should accept valid relative paths', () => {
      const result = sanitizePath('src/index.ts');
      expect(result.valid).toBe(true);
      expect(result.path).toBe('src/index.ts');
    });
  });

  describe('validateCommand', () => {
    it('should reject commands with injection patterns', () => {
      const dangerousCommands = [
        'ls; rm -rf /',
        'echo hello | cat /etc/passwd',
        'ls && cat /etc/shadow',
        'echo $(cat /etc/passwd)',
        'echo `cat /etc/passwd`',
        'ls > /tmp/output; cat /etc/passwd'
      ];

      for (const cmd of dangerousCommands) {
        const result = validateCommand(cmd);
        expect(result.valid).toBe(false);
      }
    });

    it('should accept safe commands', () => {
      const safeCommands = [
        'git status',
        'ls -la',
        'cat file.txt',
        'npm run build',
        'echo hello'
      ];

      for (const cmd of safeCommands) {
        const result = validateCommand(cmd);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject empty commands', () => {
      expect(validateCommand('').valid).toBe(false);
      expect(validateCommand('   ').valid).toBe(false);
    });
  });

  describe('validatePattern', () => {
    it('should reject patterns that are too long', () => {
      const longPattern = 'a'.repeat(600);
      const result = validatePattern(longPattern);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject patterns with path traversal', () => {
      const result = validatePattern('../../../etc/*');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should reject overly complex patterns', () => {
      const complexPattern = '('.repeat(15) + 'a' + ')'.repeat(15);
      const result = validatePattern(complexPattern);
      expect(result.valid).toBe(false);
    });

    it('should accept simple glob patterns', () => {
      const patterns = ['*.ts', '**/*.js', 'src/**/*.tsx'];
      for (const pattern of patterns) {
        expect(validatePattern(pattern).valid).toBe(true);
      }
    });
  });

  describe('validateUrl', () => {
    it('should reject non-HTTP URLs', () => {
      const urls = [
        'file:///etc/passwd',
        'ftp://example.com/file',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ];

      for (const url of urls) {
        expect(validateUrl(url).valid).toBe(false);
      }
    });

    it('should reject private IP addresses', () => {
      const urls = [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://10.0.0.1:8080',
        'http://192.168.1.1:8080',
        'http://172.16.0.1:8080'
      ];

      for (const url of urls) {
        expect(validateUrl(url).valid).toBe(false);
      }
    });

    it('should accept valid public HTTPS URLs', () => {
      const urls = [
        'https://example.com',
        'https://api.github.com/users/test',
        'http://example.com/path?query=value'
      ];

      for (const url of urls) {
        expect(validateUrl(url).valid).toBe(true);
      }
    });
  });
});
