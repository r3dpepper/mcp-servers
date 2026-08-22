/**
 * In-memory rate limiter for Docker MCP requests.
 *
 * Protects the Docker daemon from runaway clients (e.g. an agent stuck in a
 * polling loop). Enforced per client IP on the HTTP transport only; stdio
 * mode has no meaningful client identity and is not limited.
 *
 * Pattern adapted from ddg-search/src/rate-limiter.ts.
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

// Cleanup old entries periodically to prevent memory leak.
// unref()'d so the sweeper never keeps a stdio-mode process alive on its own.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requests) {
    if (entry.resetTime < now) {
      requests.delete(key);
    }
  }
}, 30_000);
sweeper.unref();
