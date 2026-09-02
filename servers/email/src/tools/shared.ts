/**
 * Shared helpers for email tool handlers.
 */

import { truncateOutput } from "../truncate.js";
import { config } from "../config.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  // Matches the MCP SDK's open-ended CallToolResult record shape
  [key: string]: unknown;
}

/** Success result — output truncation is applied uniformly here. */
export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text: truncateOutput(text) }] };
}

/** Success-shaped result flagged as an error (e.g. partial batch failure). */
export function okAsError(text: string): ToolResult {
  return { ...ok(text), isError: true };
}

/** Error result with a consistent "<action> failed: <message>" shape. */
export function fail(action: string, err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `${action}: ${message}` }],
    isError: true,
  };
}

/**
 * Reject mutating tools when EMAIL_READ_ONLY is set. Returns a fail() result
 * if blocked, or null when the call may proceed. Tool handlers should call
 * this as the first line of any mutation.
 */
export function blockedIfReadOnly(action: string): ToolResult | null {
  if (!config.readOnly) return null;
  return fail(action, new Error(
    "EMAIL_READ_ONLY=true — set EMAIL_READ_ONLY=false in .env to allow mutating tools"
  ));
}
