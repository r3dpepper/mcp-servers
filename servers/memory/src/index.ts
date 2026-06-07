// @ts-nocheck
/**
 * Memory MCP Server - Persistent knowledge graph
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage } from "http";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";

const DB_PATH = config.dbPath;
const NAMESPACE = config.namespace;

const store = {
  entities: {} as Record<string, any>,
  relations: {} as Record<string, any>,
};

let currentTransport: StreamableHTTPServerTransport | null = null;

async function init() {
  try {
    await mkdir(join(DB_PATH, ".."), { recursive: true });
    const data = JSON.parse(await readFile(DB_PATH, "utf8"));
    Object.assign(store.entities, data.entities || {});
    Object.assign(store.relations, data.relations || {});
  } catch (err) {
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      logger.warn("Database corrupted, initializing fresh");
    }
    await save();
  }
}

async function save() {
  await writeFile(DB_PATH, JSON.stringify(store, null, 2));
}

function createMcpServer() {
  const server = new McpServer({ name: "memory", version: "1.0.0" });

  server.registerTool(
    "memory_write",
    {
      description: "Create or update entities and relations in the knowledge graph",
      inputSchema: z.object({
        action: z.enum(["add_entities", "add_relations", "add_observations"]),
        entities: z.array(z.object({
          id: z.string().optional(),
          namespace: z.string().optional(),
          type: z.string(),
          value: z.string()
        })).optional(),
        relations: z.array(z.object({
          id: z.string().optional(),
          source: z.string(),
          type: z.string(),
          target: z.string(),
          metadata: z.record(z.any()).optional()
        })).optional(),
        observations: z.array(z.object({
          entityId: z.string(),
          contents: z.array(z.string())
        })).optional()
      })
    },
    async (args: {
      action: string;
      entities?: Array<{ id?: string; namespace?: string; type: string; value: string; }>;
      relations?: Array<{ id?: string; source: string; type: string; target: string; metadata?: Record<string, unknown>; }>;
      observations?: Array<{ entityId: string; contents: string[]; }>;
    }) => {
      const { action, entities, relations, observations } = args;
      switch (action) {
        case "add_entities": {
          const ids = (entities || []).map((e) => {
            const id = e.id || randomUUID();
            store.entities[id] = { ...e, id, namespace: e.namespace || NAMESPACE };
            return id;
          });
          await save();
          return { content: [{ type: "text", text: JSON.stringify({ entityIds: ids }) }] };
        }
        case "add_relations": {
          const ids = (relations || []).map((r) => {
            const id = r.id || randomUUID();
            store.relations[id] = { ...r, id };
            return id;
          });
          await save();
          return { content: [{ type: "text", text: JSON.stringify({ relationIds: ids }) }] };
        }
        case "add_observations": {
          const ids = [];
          for (const o of (observations || [])) {
            const id = randomUUID();
            store.entities[id] = { id, namespace: NAMESPACE, type: "observation", value: o.contents.join("\n") };
            store.relations[randomUUID()] = { id: randomUUID(), source: o.entityId, target: id, type: "hasObservation" };
            ids.push(id);
          }
          await save();
          return { content: [{ type: "text", text: JSON.stringify({ observationIds: ids }) }] };
        }
        default:
          return { content: [{ type: "text", text: `Unknown action: ${action}` }] };
      }
    }
  );

  server.registerTool(
    "memory_read",
    {
      description: "Read entities and relations from the knowledge graph",
      inputSchema: z.object({
        action: z.enum(["get_entity", "search", "get_graph"]),
        id: z.string().optional(),
        query: z.string().optional(),
        depth: z.number().int().positive().optional().default(2)
      })
    },
    async (args: { action: string; id?: string; query?: string; depth?: number; }) => {
      const { action, id, query, depth } = args;
      switch (action) {
        case "get_entity": {
          const entity = store.entities[id as string];
          return { content: [{ type: "text", text: JSON.stringify(entity || null) }] };
        }
        case "search": {
          const q = (query || "").toLowerCase();
          const results = Object.values(store.entities).filter((e) => e.namespace === NAMESPACE && e.value.toLowerCase().includes(q));
          return { content: [{ type: "text", text: JSON.stringify(results.slice(0, 10)) }] };
        }
        case "get_graph": {
          const graph: { relations: Array<{ type: string; target: string; }> } = { relations: [] };
          const queue = [{ current: id, depth: 0 }];
          const visited = new Set();
          while (queue.length) {
            const item = queue.shift();
            if (!item) break;
            const { current, depth: d } = item;
            if (visited.has(current) || d > (depth || 2)) continue;
            visited.add(current);
            const ent = store.entities[current as string];
            if (ent) Object.assign(graph, ent);
            for (const rel of Object.values(store.relations)) {
              if (rel.source === current) {
                if (d < (depth || 2)) queue.push({ current: rel.target, depth: d + 1 });
                graph.relations.push({ type: rel.type, target: rel.target });
              }
            }
          }
          return { content: [{ type: "text", text: JSON.stringify(graph) }] };
        }
        default:
          return { content: [{ type: "text", text: `Unknown action: ${action}` }] };
      }
    }
  );

  server.registerTool(
    "memory_manage",
    {
      description: "Manage entities, relations, and get statistics",
      inputSchema: z.object({
        action: z.enum(["delete_entity", "delete_relation", "list_entities", "stats"]),
        id: z.string().optional(),
        limit: z.number().int().positive().optional().default(100)
      })
    },
    async (args: { action: string; id?: string; limit?: number; }) => {
      const { action, id, limit } = args;
      switch (action) {
        case "delete_entity": {
          delete store.entities[id as string];
          await save();
          return { content: [{ type: "text", text: `Entity ${id} deleted` }] };
        }
        case "delete_relation": {
          delete store.relations[id as string];
          await save();
          return { content: [{ type: "text", text: `Relation ${id} deleted` }] };
        }
        case "list_entities": {
          const results = Object.values(store.entities).filter((e) => e.namespace === NAMESPACE).slice(0, limit);
          return { content: [{ type: "text", text: JSON.stringify(results) }] };
        }
        case "stats": {
          return { content: [{ type: "text", text: JSON.stringify({ entityCount: Object.keys(store.entities).length, relationCount: Object.keys(store.relations).length }) }] };
        }
        default:
          return { content: [{ type: "text", text: `Unknown action: ${action}` }] };
      }
    }
  );

  return server;
}

const MAX_BODY_SIZE = 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) reject(new Error("Request body too large"));
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function main() {
  await init();
  const useStdio = process.argv.includes("--stdio") || config.transport === "stdio";

  if (useStdio) {
    logger.info("Starting Memory MCP server in STDIO mode");
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("Memory MCP server connected via STDIO");
  } else {
    const port = config.port;

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
        res.end(JSON.stringify({
          status: "ok",
          server: "memory",
          version: "1.0.0",
          requiresApiKey: false,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      if (req.url === "/mcp" || req.url === "/") {
        // Check for required Accept header (MCP spec: accept either application/json or text/event-stream)
        const acceptHeader = req.headers['accept'];
        if (!acceptHeader || (!acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream'))) {
          logger.warn("Missing or invalid Accept header", { accept: acceptHeader });
          if (!res.headersSent) {
            res.writeHead(406, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not Acceptable: client must accept application/json or text/event-stream" }));
          }
          return;
        }

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => transport.close());

        try {
          const serverInstance = createMcpServer();
          await serverInstance.connect(transport);
          currentTransport = transport;
          const buf = await readBody(req);
          const bodyStr = buf.toString();
          if (!bodyStr.trim()) {
            throw new Error("Empty request body");
          }
          const body = JSON.parse(bodyStr);
          await transport.handleRequest(req, res, body);
        } catch (err) {
          logger.error("MCP error", { err });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "MCP error", message: err instanceof Error ? err.message : "Unknown error" }));
          }
        }
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    httpServer.listen(port, () => {
      logger.info(`Memory MCP server listening on port ${port}`);
    });

    for (const sig of ["SIGINT", "SIGTERM"]) {
      process.on(sig, () => {
        logger.info(`Received ${sig}, shutting down…`);
        httpServer.close(() => process.exit(0));
      });
    }
  }
}

main().catch((err) => logger.error("Fatal error", { err }));

export { init, store };