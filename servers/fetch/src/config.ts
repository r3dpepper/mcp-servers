/**
 * Configuration loader for Fetch MCP server.
 */

import "dotenv/config";
import process from 'process';

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
  port: optionalEnvInt("FETCH_PORT", 3005),
  // Fetch-specific configs
  maxUrlLength: optionalEnvInt("FETCH_MAX_URL_LENGTH", 2048),
  timeoutMs: optionalEnvInt("FETCH_TIMEOUT_MS", 30000),
  maxContentLength: optionalEnvInt("FETCH_MAX_CONTENT_LENGTH", 1024 * 1024), // 1MB
  userAgent: optionalEnv("FETCH_USER_AGENT", "MCP-Fetch-Server/1.0"),
  // Transport and logging
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
};