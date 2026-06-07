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
import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import { normalizePath, expandHome } from "@modelcontextprotocol/server-filesystem/dist/path-utils.js";
import {
  formatSize,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  searchFilesWithValidation,
  applyFileEdits,
  tailFile,
  headFile,
  setAllowedDirectories
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";

// Initialize allowed directories
setAllowedDirectories(config.allowedPaths);

function createMcpServer() {
  const server = new McpServer({
    name: "filesystem",
    version: "1.0.0",
  });

  // List allowed directories tool
  server.registerTool(
    "list_allowed_directories",
    {
      description: "Returns the list of directories that this server is allowed to access",
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

  // Read file tool
  server.registerTool(
    "read_file",
    {
      description: "Read the complete contents of a file as text",
      inputSchema: z.object({
        path: z.string(),
        tail: z.number().optional().describe("Return only the last N lines"),
        head: z.number().optional().describe("Return only the first N lines"),
      }),
    },
    async ({ path: filePath, tail, head }) => {
      const validPath = await validatePath(filePath);
      let content;
      if (tail) {
        content = await tailFile(validPath, tail);
      } else if (head) {
        content = await headFile(validPath, head);
      } else {
        content = await readFileContent(validPath);
      }
      return {
        content: [{ type: "text", text: content }],
      };
    }
  );

  // Write file tool
  server.registerTool(
    "write_file",
    {
      description: "Create a new file or completely overwrite an existing file",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
      }),
    },
    async ({ path: filePath, content }) => {
      const validPath = await validatePath(filePath);
      await writeFileContent(validPath, content);
      return {
        content: [{ type: "text", text: `Successfully wrote to ${filePath}` }],
      };
    }
  );

  // List directory tool
  server.registerTool(
    "list_directory",
    {
      description: "Get a detailed listing of all files and directories in a specified path",
      inputSchema: z.object({
        path: z.string(),
      }),
    },
    async ({ path: dirPath }) => {
      const validPath = await validatePath(dirPath);
      const entries = await fs.readdir(validPath, { withFileTypes: true });
      const formatted = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");
      return {
        content: [{ type: "text", text: formatted }],
      };
    }
  );

  // Create directory tool
  server.registerTool(
    "create_directory",
    {
      description: "Create a new directory or ensure a directory exists",
      inputSchema: z.object({
        path: z.string(),
      }),
    },
    async ({ path: dirPath }) => {
      const validPath = await validatePath(dirPath);
      await fs.mkdir(validPath, { recursive: true });
      return {
        content: [{ type: "text", text: `Successfully created directory ${dirPath}` }],
      };
    }
  );

  // Delete file tool
  server.registerTool(
    "delete_file",
    {
      description: "Delete a file at the specified path",
      inputSchema: z.object({
        path: z.string(),
      }),
    },
    async ({ path: filePath }) => {
      const validPath = await validatePath(filePath);
      await fs.unlink(validPath);
      return {
        content: [{ type: "text", text: `Successfully deleted ${filePath}` }],
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