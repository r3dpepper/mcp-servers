/**
 * Configuration loader for Docker MCP server.
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
  port: optionalEnvInt("DOCKER_PORT", 3007),
  socketPath: optionalEnv("DOCKER_SOCKET_PATH", "/var/run/docker.sock"),
  apiVersion: optionalEnv("DOCKER_API_VERSION", "v1.47"),
  requestTimeoutMs: optionalEnvInt("DOCKER_TIMEOUT_MS", 10000),
  // Transport and logging
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),
};
