/**
 * Utility for retrying failed requests with exponential backoff.
 *
 * Adapted from ddg-search/src/retry.ts, with a retryability
 * predicate so non-idempotent calls can opt out of blind retries.
 */

import { logger } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  /** Return true to retry this error; errors failing the check abort immediately */
  isRetryable?: (err: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const canRetry =
        attempt < retries - 1 &&
        (!options.isRetryable || options.isRetryable(lastError));

      if (!canRetry) break;

      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn("Request failed, retrying", {
        attempt: attempt + 1,
        maxRetries: retries,
        delayMs: delay,
        error: lastError.message,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
