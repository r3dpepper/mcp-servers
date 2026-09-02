/**
 * TTL-based cache for read-only Docker API results (lists, inspects, system info).
 * Every mutating operation must call clearCache() so entries never go stale
 * beyond one mutation.
 *
 * Pattern adapted from ddg-search/src/cache.ts.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

interface CacheEntry {
  data: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }

  logger.debug("Cache hit", { key });
  return entry.data as T;
}

export function setCached(key: string, data: unknown): void {
  cache.set(key, {
    data,
    expires: Date.now() + config.cacheTtlMs,
  });
}

/** Invalidate all cached entries — called after any mutating operation. */
export function clearCache(): void {
  if (cache.size > 0) {
    logger.debug("Cache cleared", { entries: cache.size });
  }
  cache.clear();
}

// Cleanup expired entries periodically.
// unref()'d so the sweeper never keeps a stdio-mode process alive on its own.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires < now) {
      cache.delete(key);
    }
  }
}, 60_000);
sweeper.unref();
