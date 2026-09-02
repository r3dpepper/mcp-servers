// @ts-nocheck
/**
 * Browser MCP Server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { 
  navigateToUrl, 
  takeScreenshot, 
  clickElement, 
  fillForm,
  evaluateJavaScript,
  extractData
} from "./browser-client.js";

function createMcpServer() {
  const server = new McpServer({
    name: "browser",
    version: "1.0.0",
  });

  // browser_navigate tool
  server.registerTool(
    "browser_navigate",
    {
      description: "Navigate to a URL in the browser. Optionally specify wait condition and timeout.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to navigate to"),
        waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional().default("load"),
        timeoutMs: z.number().int().positive().optional().default(config.navigationTimeoutMs),
      }),
    },
    async ({ url, waitUntil, timeoutMs }) => {
      try {
        const result = await navigateToUrl(url, waitUntil, timeoutMs);
        return { 
          content: [{ 
            type: "text", 
            text: `Navigated to ${url}\n${result}` 
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Navigation failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // browser_screenshot tool
  server.registerTool(
    "browser_screenshot",
    {
      description: "Take a screenshot of the current page or element. Can capture full page or viewport, and optionally set dimensions.",
      inputSchema: z.object({
        selector: z.string().optional().describe("CSS selector for element (optional, defaults to full page)"),
        fullPage: z.boolean().optional().default(false).describe("Whether to capture full page or viewport"),
        width: z.number().int().positive().optional().describe("Viewport width"),
        height: z.number().int().positive().optional().describe("Viewport height"),
      }),
    },
    async ({ selector, fullPage, width, height }) => {
      try {
        const screenshotBase64 = await takeScreenshot(
          selector, 
          fullPage ?? false, 
          width, 
          height
        );
        const selectorText = selector ? ` of element "${selector}"` : "";
        const fullPageText = fullPage ? " (full page)" : " (viewport)";
        return { 
          content: [{ 
            type: "image", 
            data: screenshotBase64,
            mimeType: "image/png"
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Screenshot failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // browser_click tool
  server.registerTool(
    "browser_click",
    {
      description: "Click on an element by CSS selector. Waits for element to be available before clicking.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector for the element to click"),
        timeoutMs: z.number().int().positive().optional().default(5000),
      }),
    },
    async ({ selector, timeoutMs }) => {
      try {
        await clickElement(selector, timeoutMs);
        return { 
          content: [{ 
            type: "text", 
            text: `Clicked element: ${selector}` 
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Click failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // browser_fill tool
  server.registerTool(
    "browser_fill",
    {
      description: "Fill a form input by CSS selector. Waits for element to be available before filling.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector for the input element"),
        value: z.string().describe("Value to fill into the input"),
        timeoutMs: z.number().int().positive().optional().default(5000),
      }),
    },
    async ({ selector, value, timeoutMs }) => {
      try {
        await fillForm(selector, value, timeoutMs);
        return { 
          content: [{ 
            type: "text", 
            text: `Filled ${selector} with "${value}"` 
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Fill failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // browser_evaluate tool
  server.registerTool(
    "browser_evaluate",
    {
      description: "Execute JavaScript in the browser context. Can pass arguments to the script.",
      inputSchema: z.object({
        script: z.string().describe("JavaScript code to execute"),
        args: z.array(z.unknown()).optional().default([]).describe("Arguments to pass to the script"),
      }),
    },
    async ({ script, args }) => {
      try {
        const result = await evaluateJavaScript(script, args);
        return { 
          content: [{ 
            type: "text", 
            text: `Evaluation result: ${JSON.stringify(result, null, 2)}` 
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Evaluation failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  // browser_extract tool
  server.registerTool(
    "browser_extract",
    {
      description: "Extract data from the page using CSS selectors. Can extract text content or specific attributes.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector for elements to extract"),
        attribute: z.string().optional().describe("Attribute to extract (optional, defaults to text content)"),
      }),
    },
    async ({ selector, attribute }) => {
      try {
        const extractedData = await extractData(selector, attribute);
        const attrText = attribute ? ` attribute "${attribute}"` : " text content";
        return { 
          content: [{ 
            type: "text", 
            text: `Extracted ${extractedData.length} items${attrText}:\n${JSON.stringify(extractedData, null, 2)}` 
          }] 
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { 
          content: [{ 
            type: "text", 
            text: `Extraction failed: ${message}` 
          }], 
          isError: true 
        };
      }
    }
  );

  return server;
}

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting Browser MCP server in STDIO mode");
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  logger.info("Browser MCP server connected via STDIO");
} else {
  const port = config.port;

  const httpServer = createHttpServer(
    async (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            server: "browser",
            version: "1.0.0",
            requiresApiKey: false,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (req.url === "/mcp" || req.url === "/") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on("close", () => transport.close());
        try {
          const server = createMcpServer();
          await server.connect(transport);
          const body = await readBody(req).then((b) => {
            const str = b.toString();
            return str ? JSON.parse(str) : undefined;
          });
          await transport.handleRequest(req, res, body);
        } catch (err) {
          logger.error("MCP request error", { err });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        }
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(port, () => {
    logger.info("Browser MCP server listening", {
      port,
      env: config.nodeEnv,
      mcpEndpoint: `http://localhost:${port}/mcp`,
      healthEndpoint: `http://localhost:${port}/health`,
      requiresApiKey: false,
    });
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      logger.info(`Received ${sig}, shutting down…`);
      httpServer.close(() => process.exit(0));
    });
  }
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB max request size

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        return reject(new Error("Request body too large"));
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
