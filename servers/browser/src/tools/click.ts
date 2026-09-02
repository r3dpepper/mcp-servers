import { z } from "zod";
import { clickElement } from "../browser-client.js";

export const browser_click = {
  // 1. The name Claude will see and call
  name: "browser_click",

  // 2. Description — be clear and specific
  description: "Click on an element by CSS selector. Waits for element to be available before clicking.",

  // 3. Input schema — validated by Zod
  schema: {
    selector: z.string().describe("CSS selector for the element to click"),
    timeoutMs: z.number().int().positive().optional().default(5000),
  },

  // 4. Handler — the actual logic
  handler: async (args: { selector: string; timeoutMs?: number }) => {
    try {
      await clickElement(args.selector, args.timeoutMs);
      return {
        content: [{ type: "text" as const, text: `Clicked element: ${args.selector}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Click failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
};
