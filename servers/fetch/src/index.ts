import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";

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

// Register tool with explicit typing to avoid deep instantiation
server.registerTool(
  "fetch_url",
  {
    description: "Fetches a URL and returns its contents as plain text",
    inputSchema: z.object({
      url: z.string().url().describe("URL to fetch"),
    }),
  },
  async (args: { url: string }) => {
    const { url } = args;

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
      return {
        content: [{ type: "text", text }],
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
        const body = await readBody(req).then((b) => {
          const s = b.toString();
          return s ? JSON.parse(s) : undefined;
        });
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