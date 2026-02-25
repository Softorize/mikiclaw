import { join, normalize, isAbsolute, relative } from 'node:path';

const SENSITIVE_PATHS = [
  'proc/self/environ',
  'proc/self/maps',
  'etc/shadow',
  'etc/passwd',
  'dev/null',
  '.ssh/id_rsa',
  '.gnupg/secring.gpg',
  '.aws/credentials',
  '.kube/config',
];

const DANGEROUS_PATTERNS = [
  /[\n;]/,
  /\|\|/,
  /&&/,
  /\|/,
  /\$\(/,
  /`[^`]+`/,
  /;[[:space:]]*rm[[:space:]]+-rf/,
  />>[[:space:]]*\/etc\/(passwd|shadow)/,
];

const MAX_PATTERN_LENGTH = 500;
const MAX_PARENTHESIS_DEPTH = 10;

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127;
}

export function sanitizePath(
  path: string,
  options?: { allowAbsolute?: boolean }
): { valid: boolean; path?: string; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string' };
  }

  if (path.includes('\0')) {
    return { valid: false, error: 'Path contains null bytes' };
  }

  const normalized = normalize(path);
  if (normalized.startsWith('..') || normalized.includes('/..')) {
    return { valid: false, error: 'Path contains traversal attempts' };
  }

  for (const sensitive of SENSITIVE_PATHS) {
    if (normalized.includes(sensitive)) {
      return { valid: false, error: `Access to sensitive path is not allowed` };
    }
  }

  if (!options?.allowAbsolute && isAbsolute(path)) {
    return { valid: false, error: 'Only relative paths are allowed' };
  }

  return { valid: true, path };
}

export function validateCommand(command: string): { valid: boolean; error?: string } {
  if (!command || !command.trim()) {
    return { valid: false, error: 'Command cannot be empty' };
  }

  const trimmed = command.trim();

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Command contains dangerous patterns' };
    }
  }

  if (
    /;\s*rm\s+-rf\s+\/|:\(\)\s*\{\s*:\s*\|\s*&\s*\};:|curl\s*\|\s*sh|wget\s*\|\s*sh/i.test(trimmed)
  ) {
    return { valid: false, error: 'Command contains shell injection patterns' };
  }

  return { valid: true };
}

export function validatePattern(
  pattern: string,
  maxLen?: number
): { valid: boolean; error?: string } {
  if (!pattern || typeof pattern !== 'string') {
    return { valid: false, error: 'Pattern must be a non-empty string' };
  }

  const lengthLimit = maxLen ?? MAX_PATTERN_LENGTH;
  if (pattern.length > lengthLimit) {
    return { valid: false, error: 'Pattern is too long' };
  }

  if (pattern.includes('..') || pattern.includes('/..')) {
    return { valid: false, error: 'Pattern contains path traversal' };
  }

  let depth = 0;
  for (const char of pattern) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (depth > MAX_PARENTHESIS_DEPTH || depth < 0) {
      return { valid: false, error: 'Pattern has unbalanced or too many parentheses' };
    }
  }

  return { valid: true };
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    if (parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || isPrivateIp(hostname)) {
        return { valid: false, error: 'Access to private/internal addresses is not allowed' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
