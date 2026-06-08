/**
 * Minimal structured logger.
 *
 * Outputs JSON lines in production so log-aggregators (CloudWatch, Datadog)
 * can parse them, and human-readable text in development.
 */

import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = levels[config.logLevel as LogLevel] ?? levels.info;
const isProd = config.nodeEnv === "production";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (levels[level] < currentLevel) return;

  const entry = {
    level,
    service: "duckduckgo-search-mcp",
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = isProd
    ? JSON.stringify(entry)
    : `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${
        meta ? " " + JSON.stringify(meta) : ""
      }`;

  // All logs go to stderr to avoid corrupting stdout (used for MCP JSON-RPC protocol)
  process.stderr.write(output + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("error", msg, meta),
};
