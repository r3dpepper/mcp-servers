/**
 * Utility for retrying failed requests with exponential backoff.
 */

import { logger } from "./logger.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn("Request failed, retrying", {
          attempt: attempt + 1,
          maxRetries: retries,
          delay,
          error: lastError.message,
        });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}