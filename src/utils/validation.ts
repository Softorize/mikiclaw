import { join, normalize, isAbsolute, relative } from "node:path";
import { configManager } from "../config/manager.js";

/**
 * Validates and sanitizes file paths to prevent path traversal attacks
 */
export function sanitizePath(inputPath: string, options?: { 
  allowAbsolute?: boolean;
  allowedBaseDirs?: string[];
}): { valid: boolean; path: string; error?: string } {
  if (!inputPath || typeof inputPath !== "string") {
    return { valid: false, path: "", error: "Invalid path: empty or not a string" };
  }

  // Check for null bytes (path truncation attack)
  if (inputPath.includes("\0")) {
    return { valid: false, path: "", error: "Invalid path: contains null bytes" };
  }

  // Normalize the path to resolve . and .. segments
  let normalizedPath = normalize(inputPath);

  // Check if path is absolute
  const isPathAbsolute = isAbsolute(normalizedPath);
  
  if (isPathAbsolute && !options?.allowAbsolute) {
    // Convert absolute path to relative if not allowed
    const workspacePath = configManager.getWorkspacePath();
    const relPath = relative(workspacePath, normalizedPath);
    
    // If the relative path starts with .., it's outside workspace
    if (relPath.startsWith("..")) {
      return { 
        valid: false, 
        path: "", 
        error: "Absolute paths outside workspace are not allowed. Use relative paths." 
      };
    }
    normalizedPath = relPath;
  }

  // Check for path traversal attempts
  if (normalizedPath.includes("..")) {
    // Resolve the full path and verify it's within allowed directories
    const workspacePath = configManager.getWorkspacePath();
    const fullPath = join(workspacePath, normalizedPath);
    const resolvedPath = normalize(fullPath);
    
    // Ensure the resolved path is within workspace
    if (!resolvedPath.startsWith(workspacePath)) {
      return { 
        valid: false, 
        path: "", 
        error: "Path traversal detected: access outside workspace is not allowed" 
      };
    }
    normalizedPath = relative(workspacePath, resolvedPath);
  }

  // Check against allowed base directories if specified
  if (options?.allowedBaseDirs) {
    const workspacePath = configManager.getWorkspacePath();
    const fullPath = join(workspacePath, normalizedPath);
    
    const isAllowed = options.allowedBaseDirs.some(baseDir => {
      const allowedPath = join(workspacePath, baseDir);
      return fullPath.startsWith(allowedPath);
    });
    
    if (!isAllowed) {
      return { 
        valid: false, 
        path: "", 
        error: `Path must be within allowed directories: ${options.allowedBaseDirs.join(", ")}` 
      };
    }
  }

  // Check for suspicious patterns (check both with and without leading slash)
  const suspiciousPatterns = [
    /(?:^|\/)proc\//i,
    /(?:^|\/)sys\//i,
    /(?:^|\/)etc\/(shadow|passwd|sudoers)/i,
    /(?:^|\/)dev\//i,
    /(?:^|\/)\.ssh\//i,
    /(?:^|\/)\.gnupg\//i,
    /(?:^|\/)\.aws\//i,
    /(?:^|\/)\.kube\//i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(normalizedPath)) {
      return { 
        valid: false, 
        path: "", 
        error: "Access to sensitive paths is not allowed" 
      };
    }
  }

  return { valid: true, path: normalizedPath };
}

/**
 * Validates a command string for shell injection attempts
 */
export function validateCommand(command: string): { valid: boolean; error?: string } {
  if (!command || typeof command !== "string") {
    return { valid: false, error: "Invalid command: empty or not a string" };
  }

  // Trim and check for empty
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return { valid: false, error: "Invalid command: empty or whitespace only" };
  }

  // Check for dangerous patterns FIRST (before safe command check)
  const dangerousPatterns = [
    /\$\(/,         // Command substitution $()
    /`[^`]*`/,      // Command substitution backticks
    /;\s*rm\s/,     // Semicolon followed by rm
    /\|\s*rm\s/,    // Pipe followed by rm
    /&&\s*rm\s/,    // AND followed by rm
    /;\s*curl\s/,   // Semicolon followed by curl
    /;\s*wget\s/,   // Semicolon followed by wget
    />\s*\/dev\//,  // Redirect to /dev
    /<\s*\/dev\//,  // Redirect from /dev
    /\|\s*cat\s/,   // Pipe followed by cat (potential data exfiltration)
    /&&\s*cat\s/,   // AND followed by cat
    /;\s*cat\s/,    // Semicolon followed by cat
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { valid: false, error: "Command contains dangerous injection pattern" };
    }
  }

  // Allow these commands (whitelist approach)
  const safeCommands = ["git", "ls", "cat", "head", "tail", "grep", "find", "pwd", "echo", "node", "npm", "tsc"];
  const firstWord = trimmedCommand.split(/\s+/)[0].toLowerCase();

  // If it's a known safe command, allow it
  if (safeCommands.includes(firstWord)) {
    return { valid: true };
  }

  // For other commands, reject by default
  return { valid: false, error: "Command not in allowed list. Use git, ls, cat, head, tail, grep, find, pwd, echo, node, npm, or tsc." };
}

/**
 * Validates search patterns for glob/grep to prevent ReDoS and path traversal
 */
export function validatePattern(pattern: string, maxLength: number = 500): { valid: boolean; error?: string } {
  if (!pattern || typeof pattern !== "string") {
    return { valid: false, error: "Invalid pattern: empty or not a string" };
  }

  if (pattern.length > maxLength) {
    return { valid: false, error: `Pattern too long (max ${maxLength} characters)` };
  }

  // Check for path traversal in pattern
  if (pattern.includes("..")) {
    return { valid: false, error: "Pattern contains path traversal" };
  }

  // Check for ReDoS-prone patterns (excessive nesting, quantifiers)
  const nestedParens = (pattern.match(/\(/g) || []).length;
  const nestedBrackets = (pattern.match(/\[/g) || []).length;
  
  if (nestedParens > 10 || nestedBrackets > 10) {
    return { valid: false, error: "Pattern too complex (too many nested groups)" };
  }

  // Check for dangerous regex patterns
  const dangerousRegexPatterns = [
    /\(\?:.*\)\*/,      // Non-capturing group with star
    /\(\?=.*\)\*/,      // Lookahead with star
    /\{[0-9]+,[0-9]+\}/, // Range quantifiers that could cause ReDoS
  ];

  for (const regexPattern of dangerousRegexPatterns) {
    if (regexPattern.test(pattern)) {
      return { valid: false, error: "Pattern contains potentially dangerous regex constructs" };
    }
  }

  return { valid: true };
}

/**
 * Validates URL for web search to prevent SSRF
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Invalid URL: empty or not a string" };
  }

  try {
    const parsedUrl = new URL(url);

    // Only allow http and https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
    }

    // Block private IP ranges to prevent SSRF
    const hostname = parsedUrl.hostname.toLowerCase();
    
    const privateRanges = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];

    for (const range of privateRanges) {
      if (range.test(hostname)) {
        return { valid: false, error: "Access to private/internal URLs is not allowed" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}
