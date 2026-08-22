/**
 * Shared helpers for docker tool handlers.
 */

import { truncateOutput } from "../truncate.js";

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

/** Error result with a consistent "<action> failed: <message>" shape. */
export function fail(action: string, err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `${action}: ${message}` }],
    isError: true,
  };
}
