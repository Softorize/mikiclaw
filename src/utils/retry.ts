import { logger } from "./logger.js";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
  retryableStatusCodes?: number[];
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  timeout: 60000, // 60 seconds
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  shouldRetry: () => true
};

/**
 * Execute a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

      try {
        const result = await Promise.race([
          fn(),
          new Promise<T>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(new Error(`Request timeout after ${opts.timeout}ms`));
            });
          })
        ]);

        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if we should retry
      if (!opts.shouldRetry(lastError)) {
        logger.warn("Not retrying", { error: lastError.message, attempt: attempt + 1 });
        throw lastError;
      }

      // Check for HTTP status codes if available
      const statusCode = (lastError as any)?.status || (lastError as any)?.response?.status;
      if (statusCode && !opts.retryableStatusCodes.includes(statusCode)) {
        logger.warn("Not retrying non-retryable status", { statusCode, attempt: attempt + 1 });
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(opts.baseDelay, opts.maxDelay, attempt);
      
      logger.info("Retrying after error", {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay
      });

      await sleep(delay);
    }
  }

  throw lastError || new Error("Unknown error after retries");
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(baseDelay: number, maxDelay: number, attempt: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Add jitter (±25% randomness)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  
  // Clamp to max delay
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with retry logic
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, {
      ...init,
      signal: init?.signal
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
      error.status = response.status;
      error.response = response;
      throw error;
    }

    return response;
  }, options);
}

/**
 * Create a retryable API client wrapper
 */
export function createRetryableClient<T extends Record<string, (...args: any[]) => any>>(
  client: T,
  methods: (keyof T)[],
  options: RetryOptions = {}
): T {
  const wrapped = { ...client };

  for (const method of methods) {
    const originalMethod = client[method];
    
    if (typeof originalMethod === "function") {
      (wrapped as any)[method] = async (...args: any[]) => {
        return withRetry(
          () => (originalMethod as any)(...args),
          options
        );
      };
    }
  }

  return wrapped;
}
