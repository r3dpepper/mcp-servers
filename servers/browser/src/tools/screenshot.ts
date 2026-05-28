import { z } from "zod";
import { takeScreenshot } from "../browser-client.js";

export const browser_screenshot = {
  // 1. The name Claude will see and call
  name: "browser_screenshot",

  // 2. Description — be clear and specific
  description: "Take a screenshot of the current page or element. Can capture full page or viewport, and optionally set dimensions.",

  // 3. Input schema — validated by Zod
  schema: {
    selector: z.string().optional().describe(
      "CSS selector for element (optional, defaults to full page)"
    ),
    fullPage: z.boolean().optional().default(false).describe(
      "Whether to capture full page or viewport"
    ),
    width: z.number().int().positive().optional().describe(
      "Viewport width"
    ),
    height: z.number().int().positive().optional().describe(
      "Viewport height"
    ),
  },

  // 4. Handler — the actual logic
  handler: async ({
    selector,
    fullPage = false,
    width,
    height,
  }: {
    selector?: string;
    fullPage?: boolean;
    width?: number;
    height?: number;
  }) => {
    try {
      const screenshotBase64 = await takeScreenshot(
        selector ?? undefined,
        fullPage,
        width,
        height
      );
      const selectorText = selector ? ` of element "${selector}"` : "";
      const fullPageText = fullPage ? " (full page)" : " (viewport)";
      return {
        content: [
          {
            type: "image",
            data: screenshotBase64,
            mimeType: "image/png",
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
};