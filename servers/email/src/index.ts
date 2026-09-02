/**
 * Email MCP Server
 *
 * Unified email access across Gmail, Outlook, iCloud, and generic IMAP/SMTP
 * providers. Tool definitions live in ./tools/, cross-cutting concerns in
 * sibling modules (credential-store, email-client, rate-limiter, truncate).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { checkRateLimit } from "./rate-limiter.js";
import { credentialBackend } from "./credential-store.js";
import {
  account_list,
  account_add,
  account_remove,
  account_test,
  folder_list,
  folder_create,
  search,
  get,
  get_attachment,
  send,
  reply,
  forward,
  draft_create,
  draft_list,
  move,
  delete_email,
  mark,
  batch_delete,
  batch_move,
  batch_mark,
} from "./tools/index.js";
import type { ToolResult } from "./tools/shared.js";

// ─── Tool registration ─────────────────────────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<ToolResult> | ToolResult;
}

const TOOLS: ToolDefinition[] = [
  // Accounts
  account_list,
  account_add,
  account_remove,
  account_test,
  // Folders
  folder_list,
  folder_create,
  // Read & search
  search,
  get,
  get_attachment,
  // Send & drafts
  send,
  reply,
  forward,
  draft_create,
  draft_list,
  // Organize
  move,
  delete_email,
  mark,
  // Batch
  batch_delete,
  batch_move,
  batch_mark,
];

function createMcpServer() {
  const server = new McpServer({
    name: "email",
    version: "1.0.0",
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

// ─── Server startup ────────────────────────────────────────────────────────

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting Email MCP server in STDIO mode", {
    credentialBackend: credentialBackend(),
  });
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  logger.info("Email MCP server connected via STDIO");
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
            server: "email",
            version: "1.0.0",
            requiresApiKey: false,
            credentialBackend: credentialBackend(),
            readOnly: config.readOnly,
            config: {
              port: config.port,
              rateLimitPerMinute: config.rateLimitPerMinute,
              maxOutputBytes: config.maxOutputBytes,
              attachmentMaxBytes: config.attachmentMaxBytes,
              defaultSearchLimit: config.defaultSearchLimit,
              allowAnyHost: config.allowAnyHost,
              trustedHosts: config.trustedHosts,
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
    logger.info("Email MCP server listening", {
      port,
      env: config.nodeEnv,
      mcpEndpoint: `http://localhost:${port}/mcp`,
      healthEndpoint: `http://localhost:${port}/health`,
      readOnly: config.readOnly,
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
