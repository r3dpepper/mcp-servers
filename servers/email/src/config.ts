/**
 * Configuration loader for Email MCP server.
 */

import "dotenv/config";
import { homedir } from "os";

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

function optionalEnvBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val == null) return fallback;
  return val.toLowerCase() === "true" || val === "1";
}

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

function optionalEnvList(key: string): string[] {
  const val = process.env[key];
  if (!val) return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const config = {
  port: optionalEnvInt("EMAIL_PORT", 3008),
  transport: optionalEnv("TRANSPORT", "http") as "stdio" | "http",
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  logLevel: optionalEnv("LOG_LEVEL", "info"),

  // Rate limiting (per-client HTTP)
  rateLimitPerMinute: optionalEnvInt("EMAIL_RATE_LIMIT_PER_MINUTE", 60),

  // Output size cap (bytes) before truncation
  maxOutputBytes: optionalEnvInt("EMAIL_MAX_OUTPUT_BYTES", 65536),

  // Per-attachment cap (bytes)
  attachmentMaxBytes: optionalEnvInt("EMAIL_ATTACHMENT_MAX_BYTES", 10 * 1024 * 1024),

  // Default search result count
  defaultSearchLimit: optionalEnvInt("EMAIL_DEFAULT_SEARCH_LIMIT", 20),

  // Host allowlist — empty means "all allowed unless EMAIL_ALLOW_ANY_HOST=false"
  // (the default is permissive; set EMAIL_TRUSTED_HOSTS to lock down)
  trustedHosts: optionalEnvList("EMAIL_TRUSTED_HOSTS"),
  allowAnyHost: optionalEnvBool("EMAIL_ALLOW_ANY_HOST", true),

  // Read-only mode blocks every mutating tool
  readOnly: optionalEnvBool("EMAIL_READ_ONLY", false),

  // OAuth callback port
  oauthCallbackPort: optionalEnvInt("EMAIL_OAUTH_CALLBACK_PORT", 3009),

  // OAuth client credentials (optional)
  gmailClientId: optionalEnv("EMAIL_GMAIL_CLIENT_ID", ""),
  gmailClientSecret: optionalEnv("EMAIL_GMAIL_CLIENT_SECRET", ""),
  outlookClientId: optionalEnv("EMAIL_OUTLOOK_CLIENT_ID", ""),
  outlookClientSecret: optionalEnv("EMAIL_OUTLOOK_CLIENT_SECRET", ""),
  outlookTenant: optionalEnv("EMAIL_OUTLOOK_TENANT", "common"),

  // Encrypted credential file (used when keytar isn't available)
  credentialFile: expandHome(
    optionalEnv("EMAIL_CREDENTIAL_FILE", "~/.mcp-servers/email-credentials.json")
  ),
};
