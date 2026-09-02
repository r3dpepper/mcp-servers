import { z } from "zod";
import { evaluateJavaScript } from "../browser-client.js";

export const browser_evaluate = {
  // 1. The name Claude will see and call
  name: "browser_evaluate",

  // 2. Description — be clear and specific
  description: "Execute JavaScript in the browser context. Can pass arguments to the script.",

  // 3. Input schema — validated by Zod
  schema: {
    script: z.string().describe("JavaScript code to execute"),
    args: z.array(z.unknown()).optional().default([]).describe("Arguments to pass to the script"),
  },

  // 4. Handler — the actual logic
  handler: async (args: { script: string; args?: unknown[] }) => {
    try {
      const result = await evaluateJavaScript(args.script, args.args);
      return {
        content: [{ type: "text" as const, text: `Evaluation result: ${JSON.stringify(result, null, 2)}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Evaluation failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
};
