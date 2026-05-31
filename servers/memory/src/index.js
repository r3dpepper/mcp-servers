/**
 * Memory MCP Server - Persistent knowledge graph
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createServer } = require("http");
const { z } = require("zod");
const { readFile, writeFile, mkdir } = require("fs/promises");
const { join } = require("path");
const { randomUUID } = require("crypto");

const PORT = process.env.MEMORY_PORT || 3006;
const DB_PATH = process.env.MEMORY_DB_PATH || join(process.env.HOME || "/", ".mcp-servers", "memory.db");
const NAMESPACE = process.env.MEMORY_NAMESPACE || "default";

const store = {
  entities: {},
  relations: {},
};

let currentTransport = null;

async function init() {
  try {
    await mkdir(join(DB_PATH, ".."), { recursive: true });
    const data = JSON.parse(await readFile(DB_PATH, "utf8"));
    Object.assign(store.entities, data.entities || {});
    Object.assign(store.relations, data.relations || {});
  } catch {
    await mkdir(join(DB_PATH, ".."), { recursive: true });
    await save();
  }
}

async function save() {
  await writeFile(DB_PATH, JSON.stringify(store, null, 2));
}

function log(msg, ...args) {
  console.error(`[memory] ${msg}`, ...args);
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
    async (args) => {
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
    async (args) => {
      const { action, id, query, depth } = args;
      switch (action) {
        case "get_entity": {
          const entity = store.entities[id];
          return { content: [{ type: "text", text: JSON.stringify(entity || null) }] };
        }
        case "search": {
          const q = (query || "").toLowerCase();
          const results = Object.values(store.entities).filter((e) => e.namespace === NAMESPACE && e.value.toLowerCase().includes(q));
          return { content: [{ type: "text", text: JSON.stringify(results.slice(0, 10)) }] };
        }
        case "get_graph": {
          const graph = { id, namespace: "", type: "", value: "", relations: [] };
          const queue = [{ current: id, depth: 0 }];
          const visited = new Set();
          while (queue.length) {
            const { current, depth: d } = queue.shift();
            if (visited.has(current) || d > depth) continue;
            visited.add(current);
            const ent = store.entities[current];
            if (ent) Object.assign(graph, ent);
            for (const rel of Object.values(store.relations)) {
              if (rel.source === current) {
                if (d < depth) queue.push({ current: rel.target, depth: d + 1 });
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
    async (args) => {
      const { action, id, limit } = args;
      switch (action) {
        case "delete_entity": {
          delete store.entities[id];
          await save();
          return { content: [{ type: "text", text: `Entity ${id} deleted` }] };
        }
        case "delete_relation": {
          delete store.relations[id];
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
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
  const useStdio = process.argv.includes("--stdio");

  if (useStdio) {
    log("Starting Memory MCP server in STDIO mode");
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const httpServer = createServer(async (req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "memory", version: "1.0.0" }));
        return;
      }
      if (req.url === "/mcp" || req.url === "/") {
        const acceptHeader = req.headers['accept'];
        if (!acceptHeader || !acceptHeader.includes('application/json') || !acceptHeader.includes('text/event-stream')) {
          console.warn('Missing or invalid Accept header', { accept: acceptHeader });
          if (!res.headersSent) {
            res.writeHead(406, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not Acceptable: client must accept application/json and text/event-stream" }));
          }
          return;
        }

        if (currentTransport) {
          currentTransport.close();
          currentTransport = null;
        }

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => transport.close());
        try {
          const serverInstance = createMcpServer();
          await serverInstance.connect(transport);
          currentTransport = transport;
          const buf = await readBody(req);
          const body = JSON.parse(buf.toString());
          await transport.handleRequest(req, res, body);
        } catch (err) {
          console.error("[memory] MCP error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "MCP error" }));
          }
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    httpServer.listen(PORT, () => log(`Memory server listening on port ${PORT}`));
  }
}

main().catch(log);

module.exports = { init, store };