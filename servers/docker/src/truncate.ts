/**
 * Output size capping for tool results.
 *
 * Docker responses (raw logs especially) can be megabytes; unbounded text
 * ends up in the calling model's context window. Every tool's success path
 * goes through truncateOutput() so nothing oversized slips through.
 */

import { config } from "./config.js";

export function truncateOutput(text: string): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= config.maxOutputBytes) {
    return text;
  }

  // Cut at a raw byte boundary; a split multibyte char becomes a replacement
  // character, which is acceptable at a hard cap.
  const clipped = Buffer.from(text, "utf8")
    .subarray(0, config.maxOutputBytes)
    .toString("utf8");

  return `${clipped}\n\n…[truncated ${bytes - config.maxOutputBytes} of ${bytes} bytes — raise DOCKER_MAX_OUTPUT_BYTES to see more]`;
}
