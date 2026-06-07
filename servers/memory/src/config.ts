/**
 * Configuration loader for Memory MCP server.
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
    throw new Error(`Environment variable ${key} must be an integer, got: "${val}"`);
  }
  return n;
}

export const config = {
  port: optionalEnvInt("MEMORY_PORT", 3006),
  dbPath: optionalEnv("MEMORY_DB_PATH", `${process.env.HOME || "/"}/.mcp-servers/memory.db`),
  namespace: optionalEnv("MEMORY_NAMESPACE", "default"),
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
};