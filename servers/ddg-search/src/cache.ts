/**
 * TTL-based cache for DuckDuckGo search results.
 * Reduces API calls and improves response time for repeated queries.
 */

import { DuckDuckGoSearchResponse } from "./duckduckgo-client.js";

interface CacheEntry {
  data: DuckDuckGoSearchResponse;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes

export function createCacheKey(query: string, maxResults: number): string {
  return `${query.toLowerCase().trim()}:${maxResults}`;
}

export function getCached(key: string): DuckDuckGoSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCached(key: string, data: DuckDuckGoSearchResponse, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, {
    data,
    expires: Date.now() + ttlMs,
  });
}

export function clearCache(): void {
  cache.clear();
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires < now) {
      cache.delete(key);
    }
  }
}, 60_000);