import { z } from "zod";
import { fillForm } from "../browser-client.js";

export const browser_fill = {
  // 1. The name Claude will see and call
  name: "browser_fill",

  // 2. Description — be clear and specific
  description: "Fill a form input by CSS selector. Waits for element to be available before filling.",

  // 3. Input schema — validated by Zod
  schema: {
    selector: z.string().describe("CSS selector for the input element"),
    value: z.string().describe("Value to fill into the input"),
    timeoutMs: z.number().int().positive().optional().default(5000),
  },

  // 4. Handler — the actual logic
  handler: async (args: { selector: string; value: string; timeoutMs?: number }) => {
    try {
      await fillForm(args.selector, args.value, args.timeoutMs);
      return {
        content: [{ type: "text" as const, text: `Filled ${args.selector} with "${args.value}"` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Fill failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
};
