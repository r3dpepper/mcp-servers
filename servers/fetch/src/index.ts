import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import TurndownService from "turndown";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * HTML→markdown conversion so agents receive readable documents instead of
 * markup soup. Non-content elements are dropped before conversion.
 */
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});
turndown.remove(["script", "style", "noscript", "iframe", "nav", "footer"]);

/**
 * Validate URL scheme to prevent accessing dangerous protocols.
 */
function isValidUrlScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries: number = 3, baseDelayMs: number = 1000): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn("Fetch request failed, retrying", {
          attempt: attempt + 1,
          maxRetries: retries,
          delay,
          error: lastError.message,
        });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

const server = new McpServer({
  name: "fetch",
  version: "1.0.0",
});

/**
 * Handle tools/list protocol method
 */
server.registerTool(
  "list_tools",
  {
    description: "List all available tools",
    inputSchema: z.object({}),
  },
  async () => {
    const toolNames = ["fetch_url", "list_tools"];
    return {
      content: [
        { type: "text", text: toolNames.join("\n") },
      ],
    };
  }
);

// Register tool with explicit typing to avoid deep instantiation

/** Default page size for paginated reads (characters) */
const DEFAULT_MAX_LENGTH = 20_000;

server.registerTool(
  "fetch_url",
  {
    description:
      "Fetches a URL and returns its contents as markdown (HTML pages are converted; " +
      "use raw=true for the original markup). Large documents are returned in pages — " +
      "call again with start_index to continue reading where the previous page ended.",
    inputSchema: z.object({
      url: z.string().url().describe("URL to fetch"),
      max_length: z.number().int().positive().max(200_000).optional()
        .describe(`Maximum number of characters to return (default: ${DEFAULT_MAX_LENGTH})`),
      start_index: z.number().int().min(0).optional()
        .describe("Character offset to start from — use the start_index reported by a previous page"),
      raw: z.boolean().optional().default(false)
        .describe("Return the original HTML instead of converting to markdown"),
    }),
  },
  async (args: { url: string; max_length?: number; start_index?: number; raw?: boolean }) => {
    const { url } = args;
    let responseContentType = "";

    // Security: Validate URL scheme
    if (!isValidUrlScheme(url)) {
      return {
        content: [{ type: "text", text: "Error: Only http and https URLs are allowed" }],
        isError: true,
      };
    }

    // Security: Check URL length
    if (url.length > config.maxUrlLength) {
      return {
        content: [{ type: "text", text: `Error: URL exceeds maximum length of ${config.maxUrlLength} characters` }],
        isError: true,
      };
    }

    try {
      logger.debug(`Fetching ${url}`);

      const fetchFn = async () => {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

        try {
          const response = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": config.userAgent },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Check content length
          const contentLength = response.headers.get("content-length");
          if (contentLength) {
            const length = parseInt(contentLength, 10);
            if (length > config.maxContentLength) {
              throw new Error(`Response too large (${length} bytes)`);
            }
          }

          // Validate content type
          const contentType = response.headers.get("content-type");
          responseContentType = contentType ?? "";
          const allowedTypes = ["text/", "application/json", "application/xml", "application/javascript"];
          if (contentType && !allowedTypes.some(t => contentType.includes(t))) {
            throw new Error(`Unsupported content type: ${contentType}`);
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }

          return response.text();
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      const text = await withRetry(fetchFn);

      // HTML pages become markdown unless raw markup was requested; other
      // content types (json/xml/js/text) pass through untouched
      let content = text;
      if (!args.raw && /text\/html/i.test(responseContentType)) {
        try {
          content = turndown.turndown(text);
        } catch (err) {
          logger.warn("HTML→markdown conversion failed; returning raw", { url });
        }
      }

      // Paginated read: return one slice plus a resume hint, so a huge
      // document cannot flood the caller's context in one shot
      const maxLength = args.max_length ?? DEFAULT_MAX_LENGTH;
      const startIndex = args.start_index ?? 0;

      if (startIndex >= content.length) {
        return {
          content: [{ type: "text", text: `No more content — document is ${content.length} characters.` }],
        };
      }

      const chunk = content.slice(startIndex, startIndex + maxLength);
      const nextIndex = startIndex + chunk.length;
      const remaining = content.length - nextIndex;
      const trailer = remaining > 0
        ? `\n\n[characters ${startIndex}–${nextIndex} of ${content.length}; call again with start_index=${nextIndex} to continue]`
        : `\n\n[end of document — ${content.length} characters total]`;

      return {
        content: [{ type: "text", text: chunk + trailer }],
      };
    } catch (error) {
      logger.error("Fetch failed", { error, url });
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Fetch failed: ${message}` }],
        isError: true,
      };
    }
  }
);

const MAX_BODY_SIZE = 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) reject(new Error("Too large"));
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting Fetch MCP server in STDIO mode");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Fetch MCP server connected via STDIO");
} else {
  const httpServer = createHttpServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type,accept");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          server: "fetch",
          version: "1.0.0",
          requiresApiKey: false,
          config: {
            timeoutMs: config.timeoutMs,
            maxContentLength: config.maxContentLength,
            maxUrlLength: config.maxUrlLength,
          },
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (req.url === "/mcp" || req.url === "/") {
      // Check for required Accept header (MCP spec: accept either application/json or text/event-stream)
      const acceptHeader = req.headers['accept'];
      if (!acceptHeader || (!acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream'))) {
        logger.warn('Missing or invalid Accept header', {
          url: req.url,
          accept: acceptHeader,
          method: req.method
        });
        if (!res.headersSent) {
          res.writeHead(406, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Not Acceptable: Client must accept application/json or text/event-stream"
            },
            id: null
          }));
        }
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => transport.close());
      logger.debug('Starting MCP connection', { url: req.url, accept: acceptHeader });

      try {
        await server.connect(transport);
        const buf = await readBody(req);
        const bodyStr = buf.toString();
        if (!bodyStr.trim()) {
          throw new Error("Empty request body");
        }
        const body = JSON.parse(bodyStr);
        logger.debug('Handling MCP request', { body });
        await transport.handleRequest(req, res, body);
      } catch (err) {
        logger.error("MCP error", { err, url: req.url, method: req.method });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal error" }));
        }
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(config.port, () => {
    logger.info("Fetch MCP server running", {
      port: config.port,
      endpoint: `http://localhost:${config.port}/mcp`,
    });
  });
}