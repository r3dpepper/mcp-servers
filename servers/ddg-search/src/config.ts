/**
 * Configuration loader for DuckDuckGo Search MCP server.
 */

import "dotenv/config";

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalEnvInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n)) {
    throw new Error(
      `Environment variable ${key} must be an integer, got: "${val}"`
    );
  }
  return n;
}

export const config = {
  port: optionalEnvInt("DDG_PORT", 3002),
  maxResults: Math.min(optionalEnvInt("DDG_MAX_RESULTS", 10), 50),
  requestTimeoutMs: optionalEnvInt("DDG_TIMEOUT_MS", 10000),
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
  // Rate limiting
  rateLimitPerMinute: optionalEnvInt("DDG_RATE_LIMIT_PER_MINUTE", 10),
  // Caching
  cacheTtlSeconds: optionalEnvInt("DDG_CACHE_TTL_SECONDS", 300),
};