import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";

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
    try {
      logger.debug(`Fetching ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": config.userAgent },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      return {
        content: [{ type: "text", text }],
      };
    } catch (error) {
      logger.error("Fetch failed", { error, url });
      throw error;
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

const useStdio = process.argv.includes("--stdio");

if (useStdio) {
  // In stdio mode we just let the parent process handle the server
} else {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          server: "fetch",
          version: "1.0.0",
          requiresApiKey: false,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (req.url === "/mcp" || req.url === "/") {
      // Check for required Accept header
      const acceptHeader = req.headers['accept'];
      if (!acceptHeader || !acceptHeader.includes('application/json') || !acceptHeader.includes('text/event-stream')) {
        logger.warn('Missing or invalid Accept header', {
          url: req.url,
          accept: acceptHeader,
          method: req.method
        });
        if (!res.headersSent) {
          res.writeHead(406, { "Content-Type": "application/json" }); // 406 Not Acceptable
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Not Acceptable: Client must accept both application/json and text/event-stream"
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