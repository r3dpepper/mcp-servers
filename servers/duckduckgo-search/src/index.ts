// @ts-nocheck
/**
 * DuckDuckGo Search MCP Server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { duckDuckGoSearch, fetchInstantAnswer } from "./duckduckgo-client.js";
import { checkRateLimit, getRateLimitStatus } from "./rate-limiter.js";

function createMcpServer() {
  const server = new McpServer({
    name: "duckduckgo-search",
    version: "1.0.0",
  });

  // duckduckgo_search tool
  server.registerTool(
    "duckduckgo_search",
    {
      description: "Search the web using DuckDuckGo. No API key required.",
      inputSchema: z.object({
        query: z.string().min(1).max(512),
        num_results: z.number().int().min(1).max(50).optional().default(10),
      }),
    },
    async ({ query, num_results }) => {
      try {
        const response = await duckDuckGoSearch(query, num_results);
        const parts = [];

        const ia = response.instantAnswer;
        if (ia) {
          if (ia.heading) parts.push(`## ${ia.heading}`);
          if (ia.answer) parts.push(`**Quick Answer:** ${ia.answer}`);
          if (ia.abstract) {
            const source = ia.abstractSource ? ` *(${ia.abstractSource})*` : "";
            parts.push(`${ia.abstract}${source}`);
            if (ia.abstractURL) parts.push(`Source: ${ia.abstractURL}`);
          }
          if (ia.definition) {
            const source = ia.definitionSource ? ` *(${ia.definitionSource})*` : "";
            parts.push(`**Definition:** ${ia.definition}${source}`);
          }
          if (ia.infobox.length > 0) {
            parts.push(
              "**Details:**\n" +
                ia.infobox
                  .map((item) => `- **${item.label}:** ${item.value}`)
                  .join("\n")
            );
          }
          if (ia.relatedTopics.length > 0) {
            parts.push(
              "**Related:**\n" +
                ia.relatedTopics.map((t) => `- [${t.text}](${t.url})`).join("\n")
            );
          }
        }

        if (response.webResults.length > 0) {
          if (parts.length > 0) parts.push("---");
          parts.push(`**Web Results for: "${query}"**\n`);
          parts.push(
            response.webResults
              .map(
                (r, i) =>
                  `${i + 1}. **${r.title}**\n   ${r.url}${r.snippet ? "\n   " + r.snippet : ""}`
              )
              .join("\n\n")
          );
        }

        if (parts.length === 0) {
          return { content: [{ type: "text", text: `No results found for: "${query}"` }] };
        }

        return { content: [{ type: "text", text: parts.join("\n\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Search failed: ${message}` }], isError: true };
      }
    }
  );

  // duckduckgo_instant_answer tool
  server.registerTool(
    "duckduckgo_instant_answer",
    {
      description: "Get a structured instant answer from DuckDuckGo. No API key required.",
      inputSchema: z.object({
        query: z.string().min(1).max(512),
      }),
    },
    async ({ query }) => {
      try {
        const ia = await fetchInstantAnswer(query);

        if (!ia) {
          return {
            content: [
              {
                type: "text",
                text: `No instant answer found for: "${query}"\n\nTry duckduckgo_search for web results instead.`,
              },
            ],
          };
        }

        const parts = [];
        if (ia.heading) parts.push(`# ${ia.heading}`);
        if (ia.answer) parts.push(`**Answer:** ${ia.answer}`);
        if (ia.abstract) {
          parts.push(ia.abstract);
          if (ia.abstractSource) parts.push(`*Source: ${ia.abstractSource} — ${ia.abstractURL}*`);
        }
        if (ia.definition) {
          parts.push(`**Definition:** ${ia.definition}`);
          if (ia.definitionSource) parts.push(`*Source: ${ia.definitionSource}*`);
        }
        if (ia.infobox.length > 0) {
          parts.push(
            "**Details:**\n" +
              ia.infobox.map((i) => `- **${i.label}:** ${i.value}`).join("\n")
          );
        }
        if (ia.relatedTopics.length > 0) {
          parts.push(
            "**Related topics:**\n" +
              ia.relatedTopics.map((t) => `- ${t.text} — ${t.url}`).join("\n")
          );
        }

        return { content: [{ type: "text", text: parts.join("\n\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Instant answer failed: ${message}` }], isError: true };
      }
    }
  );

  return server;
}

const useStdio =
  process.argv.includes("--stdio") || config.transport === "stdio";

if (useStdio) {
  logger.info("Starting DuckDuckGo Search MCP server in STDIO mode");
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  logger.info("DuckDuckGo Search MCP server connected via STDIO");
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
            server: "duckduckgo-search",
            version: "1.0.0",
            requiresApiKey: false,
            rateLimit: {
              perMinute: config.rateLimitPerMinute,
            },
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Rate limiting for MCP endpoints
      const clientId = req.headers["x-forwarded-for"]?.toString() || "default";
      if (!checkRateLimit(clientId)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32604,
            message: "Rate limit exceeded. Please retry later."
          },
          id: null
        }));
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
          const server = createMcpServer();
          await server.connect(transport);
          const body = await readBody(req).then((b) => {
            const str = b.toString();
            return str ? JSON.parse(str) : undefined;
          });
          await transport.handleRequest(req, res, body);
        } catch (err) {
          logger.error("MCP request error", { err, url: req.url, method: req.method });
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
    logger.info("DuckDuckGo Search MCP server listening", {
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