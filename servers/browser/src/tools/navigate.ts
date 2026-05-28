import { z } from "zod";
import { navigateToUrl } from "../browser-client.js";

export const browser_navigate = {
  // 1. The name Claude will see and call
  name: "browser_navigate",

  // 2. Description — be clear and specific
  description: "Navigate to a URL in the browser. Optionally specify wait condition and timeout.",

  // 3. Input schema — validated by Zod
  schema: {
    url: z.string().url().describe("The URL to navigate to"),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional().default("load"),
    timeoutMs: z.number().int().positive().optional().default(15000),
  },

  // 4. Handler — the actual logic
  handler: async (args: { url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeoutMs?: number }) => {
    try {
      const result = await navigateToUrl(args.url, args.waitUntil, args.timeoutMs);
      return {
        content: [{ type: "text" as const, text: `Navigated to ${args.url}\n${result}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Navigation failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
};
