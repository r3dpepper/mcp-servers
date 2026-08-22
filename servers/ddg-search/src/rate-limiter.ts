/**
 * In-memory rate limiter for DuckDuckGo search requests.
 * Prevents abuse and rate limits requests per client identifier.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const requests = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000; // 1 minute window

export function checkRateLimit(clientId: string = "default"): boolean {
  const now = Date.now();
  const limit = config.rateLimitPerMinute;

  const entry = requests.get(clientId);

  if (!entry || now >= entry.resetTime) {
    // New window or first request
    requests.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= limit) {
    logger.warn("Rate limit exceeded", { clientId, count: entry.count, limit });
    return false;
  }

  entry.count++;
  return true;
}

export function getRateLimitStatus(clientId: string = "default"): { count: number; limit: number; resetMs: number } {
  const entry = requests.get(clientId);
  if (!entry) return { count: 0, limit: config.rateLimitPerMinute, resetMs: WINDOW_MS };

  return {
    count: entry.count,
    limit: config.rateLimitPerMinute,
    resetMs: Math.max(0, entry.resetTime - Date.now()),
  };
}

// Cleanup old entries periodically to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requests) {
    if (entry.resetTime < now) {
      requests.delete(key);
    }
  }
}, 30_000);