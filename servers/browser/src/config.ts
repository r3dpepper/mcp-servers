/**
 * Configuration loader for Browser MCP server.
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
  port: optionalEnvInt("BROWSER_PORT", 3003),
  // Browser-specific configs
  headless: optionalEnv("BROWSER_HEADLESS", "true") === "true",
  maxConcurrentContexts: optionalEnvInt("BROWSER_MAX_CONTEXTS", 3),
  contextTimeoutMs: optionalEnvInt("BROWSER_CONTEXT_TIMEOUT", 30000),
  navigationTimeoutMs: optionalEnvInt("BROWSER_NAV_TIMEOUT", 15000),
  // Allowed domains for navigation (comma-separated list, empty = all allowed)
  allowedDomains: optionalEnv("BROWSER_ALLOWED_DOMAINS", ""),
  blockedDomains: optionalEnv("BROWSER_BLOCKED_DOMAINS", ""),
  requestTimeoutMs: optionalEnvInt("BROWSER_TIMEOUT_MS", 10000),
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
};
