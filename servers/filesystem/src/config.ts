/**
 * Configuration loader for Filesystem MCP server.
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
  port: optionalEnvInt("FILESYSTEM_PORT", 3004),
  // Filesystem-specific configs
  allowedPaths: optionalEnv("FILESYSTEM_ALLOWED_PATHS", "/tmp").split(","),
  maxFileSizeBytes: optionalEnvInt("FILESYSTEM_MAX_FILE_SIZE", 1024 * 1024), // 1MB
  maxFilesListed: optionalEnvInt("FILESYSTEM_MAX_FILES_LISTED", 100),
  // Transport and logging
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
};