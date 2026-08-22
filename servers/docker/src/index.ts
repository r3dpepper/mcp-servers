/**
 * Docker MCP Server
 *
 * Exposes Docker Engine API operations as MCP tools via Unix socket.
 * Tool definitions live in ./tools/, cross-cutting concerns in sibling modules
 * (retry, cache, rate-limiter, truncate).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { checkRateLimit } from "./rate-limiter.js";
import {
  containers_list,
  container_inspect,
  container_logs,
  container_logs_follow,
  container_stats,
  container_start,
  container_stop,
  container_restart,
  container_remove,
  images_list,
  image_inspect,
  image_remove,
  system_info,
  system_df,
  build,
  events,
  system_prune,
  build_cache_prune,
} from "./tools/index.js";
import type { ToolResult } from "./tools/shared.js";

// ─── MCP Server ──────────────────────────────────────────────────────────────

/**
 * Loosely-typed view of a tool definition. Each concrete tool keeps its exact
 * zod-inferred handler types in its own file; the union across 18 different
 * schemas can't be expressed generically here, hence `any` on the handler arg
 * (matching the SDK's own `(args: any, extra)` callback signature).
 */
interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<ToolResult> | ToolResult;
}

const TOOLS: ToolDefinition[] = [
  // Containers
  containers_list,
  container_inspect,
  container_logs,
  container_logs_follow,
  container_stats,
  container_start,
  container_stop,
  container_restart,
  container_remove,
  // Images
  images_list,
  image_inspect,
  image_remove,
  // System
  system_info,
  system_df,
  events,
  // Build
  build,
  build_cache_prune,
  // Prune
  system_prune,
];

function createMcpServer() {
  const server = new McpServer({
    name: "docker",
    version: "1.1.0",
  });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      tool.handler
    );
  }

  return server;
}

// ─── Server startup ──────────────────────────────────────────────────────────

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting Docker MCP server in STDIO mode", {
    socketPath: config.socketPath,
  });
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  logger.info("Docker MCP server connected via STDIO");
} else {
  const port = config.port;

  const httpServer = createHttpServer(
    async (req, res) => {
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
            server: "docker",
            version: "1.1.0",
            requiresApiKey: false,
            socketPath: config.socketPath,
            apiVersion: config.apiVersion,
            config: {
              timeoutMs: config.requestTimeoutMs,
              buildTimeoutMs: config.buildTimeoutMs,
              cacheTtlMs: config.cacheTtlMs,
              rateLimitPerMinute: config.rateLimitPerMinute,
              maxOutputBytes: config.maxOutputBytes,
            },
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (req.url === "/mcp" || req.url === "/") {
        // Per-client rate limiting (HTTP transport only; /health is exempt)
        if (!checkRateLimit(req.socket.remoteAddress ?? "unknown")) {
          if (!res.headersSent) {
            res.writeHead(429, {
              "Content-Type": "application/json",
              "Retry-After": "60",
            });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32000,
                  message: `Rate limit exceeded (${config.rateLimitPerMinute} requests/minute). Retry shortly.`,
                },
                id: null,
              })
            );
          }
          return;
        }

        // Check for required Accept header (MCP spec)
        const acceptHeader = req.headers["accept"];
        if (
          !acceptHeader ||
          (!acceptHeader.includes("application/json") &&
            !acceptHeader.includes("text/event-stream"))
        ) {
          logger.warn("Missing or invalid Accept header", {
            url: req.url,
            accept: acceptHeader,
            method: req.method,
          });
          if (!res.headersSent) {
            res.writeHead(406, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message:
                    "Not Acceptable: Client must accept application/json or text/event-stream",
                },
                id: null,
              })
            );
          }
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on("close", () => transport.close());
        logger.debug("Starting MCP connection", {
          url: req.url,
          accept: acceptHeader,
        });

        try {
          const server = createMcpServer();
          await server.connect(transport);
          const body = await readBody(req).then((b) => {
            const str = b.toString();
            return str ? JSON.parse(str) : undefined;
          });
          await transport.handleRequest(req, res, body);
        } catch (err) {
          logger.error("MCP request error", {
            err,
            url: req.url,
            method: req.method,
          });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal error" }));
          }
        }
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  );

  httpServer.listen(port, () => {
    logger.info("Docker MCP server listening", {
      port,
      env: config.nodeEnv,
      mcpEndpoint: `http://localhost:${port}/mcp`,
      healthEndpoint: `http://localhost:${port}/health`,
      socketPath: config.socketPath,
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

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
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
