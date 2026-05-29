// @ts-nocheck
/**
 * Filesystem MCP Server
 * Wraps the official @modelcontextprotocol/server-filesystem package.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";

const SESSION_IDS = new Set<string>();

function createMcpServer() {
  const server = new McpServer({
    name: "filesystem",
    version: "1.0.0",
  });

  // Return the official server-info tool for discovery
  server.registerTool(
    "filesystem_list_allowed",
    {
      description: "List the directories that are allowed for filesystem access",
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [{
          type: "text",
          text: `Allowed directories:\n${config.allowedPaths.map(p => `- ${p}`).join("\n")}`,
        }],
      };
    }
  );

  return server;
}

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting Filesystem MCP server in STDIO mode");

  // In stdio mode, directly spawn the official filesystem server
  const allowedPaths = config.allowedPaths.map(p => ["--allowedPath", p]).flat();
  const proc = spawn("npx", ["@modelcontextprotocol/server-filesystem", ...allowedPaths], {
    shell: true,
    stdio: "inherit",
  });

  proc.on("close", (code) => {
    process.exit(code ?? 0);
  });
} else {
  const port = config.port;

  const httpServer = createHttpServer(
    async (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            server: "filesystem",
            version: "1.0.0",
            requiresApiKey: false,
            allowedPaths: config.allowedPaths,
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
    logger.info("Filesystem MCP server listening", {
      port,
      env: config.nodeEnv,
      mcpEndpoint: `http://localhost:${port}/mcp`,
      healthEndpoint: `http://localhost:${port}/health`,
      requiresApiKey: false,
      allowedPaths: config.allowedPaths,
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

function readBody(req: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
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