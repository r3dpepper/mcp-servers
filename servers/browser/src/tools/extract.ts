import { z } from "zod";
import { extractData } from "../browser-client.js";

export const browser_extract = {
  // 1. The name Claude will see and call
  name: "browser_extract",

  // 2. Description — be clear and specific
  description: "Extract data from the page using CSS selectors. Can extract text content or specific attributes.",

  // 3. Input schema — validated by Zod
  schema: {
    selector: z.string().describe("CSS selector for elements to extract"),
    attribute: z.string().optional().describe("Attribute to extract (optional, defaults to text content)"),
  },

  // 4. Handler — the actual logic
  handler: async (args: { selector: string; attribute?: string }) => {
    try {
      const extractedData = await extractData(args.selector, args.attribute);
      const attrText = args.attribute ? ` attribute "${args.attribute}"` : " text content";
      return {
        content: [{ type: "text" as const, text: `Extracted ${extractedData.length} items${attrText}:\n${JSON.stringify(extractedData, null, 2)}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Extraction failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
};
