/**
 * Docker MCP Server
 *
 * Exposes Docker Engine API operations as MCP tools via Unix socket.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import {
  listContainers,
  inspectContainer,
  getContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  listImages,
  inspectImage,
  removeImage,
  getSystemInfo,
  getSystemDf,
  buildImage,
  getEvents,
  pruneSystem,
  pruneBuildCache,
  getContainerStats,
  getContainerLogsFollow,
} from "./docker-client.js";

// ─── MCP Server ──────────────────────────────────────────────────────────────

function createMcpServer() {
  const server = new McpServer({
    name: "docker",
    version: "1.0.0",
  });

  // ── Container tools ──────────────────────────────────────────────────────

  server.registerTool(
    "docker_containers_list",
    {
      description: "List Docker containers. By default shows all containers (running and stopped).",
      inputSchema: z.object({
        all: z.boolean().optional().default(true).describe("Show all containers (true) or only running (false)"),
      }),
    },
    async ({ all }) => {
      try {
        const containers = await listContainers(all);
        if (containers.length === 0) {
          return { content: [{ type: "text", text: "No containers found." }] };
        }

        const lines = containers.map((c) => {
          const names = (c.Names ?? []).map((n) => n.replace(/^\//, "")).join(", ");
          const ports = (c.Ports ?? []).length > 0
            ? (c.Ports ?? []).map((p) => `${p.PublicPort ?? ""}:${p.PrivatePort}/${p.Type}`).join(", ")
            : "none";
          return [
            `**${names || c.Id.substring(0, 12)}**`,
            `  ID: ${c.Id.substring(0, 12)}`,
            `  Image: ${c.Image}`,
            `  State: ${c.State} (${c.Status})`,
            `  Ports: ${ports}`,
          ].join("\n");
        });

        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to list containers: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_inspect",
    {
      description: "Inspect a Docker container by ID or name. Returns detailed container configuration.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
      }),
    },
    async ({ id }) => {
      try {
        const info = await inspectContainer(id);
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to inspect container: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_logs",
    {
      description: "Get logs from a Docker container (stdout and stderr).",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
        tail: z.number().int().min(1).max(10000).optional().default(100).describe("Number of lines from the end"),
      }),
    },
    async ({ id, tail }) => {
      try {
        const logs = await getContainerLogs(id, tail);
        if (!logs.trim()) {
          return { content: [{ type: "text", text: "No logs found." }] };
        }
        return { content: [{ type: "text", text: logs }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to get logs: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_start",
    {
      description: "Start a stopped Docker container.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
      }),
    },
    async ({ id }) => {
      try {
        await startContainer(id);
        return { content: [{ type: "text", text: `Container ${id} started successfully.` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to start container: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_stop",
    {
      description: "Stop a running Docker container.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
      }),
    },
    async ({ id }) => {
      try {
        await stopContainer(id);
        return { content: [{ type: "text", text: `Container ${id} stopped successfully.` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to stop container: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_restart",
    {
      description: "Restart a Docker container.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
      }),
    },
    async ({ id }) => {
      try {
        await restartContainer(id);
        return { content: [{ type: "text", text: `Container ${id} restarted successfully.` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to restart container: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_remove",
    {
      description: "Remove a Docker container. Container must be stopped first unless force=true.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
        force: z.boolean().optional().default(false).describe("Force remove even if running"),
      }),
    },
    async ({ id, force }) => {
      try {
        await removeContainer(id, force);
        return { content: [{ type: "text", text: `Container ${id} removed successfully.` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to remove container: ${message}` }], isError: true };
      }
    }
  );

  // ── Image tools ──────────────────────────────────────────────────────────

  server.registerTool(
    "docker_images_list",
    {
      description: "List all Docker images on the host.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const images = await listImages();
        if (images.length === 0) {
          return { content: [{ type: "text", text: "No images found." }] };
        }

        const lines = images.map((img) => {
          const tags = (img.RepoTags ?? []).join(", ") || "<none>";
          const sizeMB = (img.Size / (1024 * 1024)).toFixed(1);
          return [
            `**${tags}**`,
            `  ID: ${img.Id.substring(0, 12)}`,
            `  Size: ${sizeMB} MB`,
            `  Created: ${new Date(img.Created * 1000).toISOString()}`,
          ].join("\n");
        });

        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to list images: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_image_inspect",
    {
      description: "Inspect a Docker image by ID or name. Returns detailed image configuration.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Image ID, name, or tag"),
      }),
    },
    async ({ id }) => {
      try {
        const info = await inspectImage(id);
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to inspect image: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_image_remove",
    {
      description: "Remove a Docker image. Use force=true to remove even if used by containers.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Image ID, name, or tag"),
        force: z.boolean().optional().default(false).describe("Force remove even if in use"),
      }),
    },
    async ({ id, force }) => {
      try {
        await removeImage(id, force);
        return { content: [{ type: "text", text: `Image ${id} removed successfully.` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to remove image: ${message}` }], isError: true };
      }
    }
  );

  // ── System tools ─────────────────────────────────────────────────────────

  server.registerTool(
    "docker_system_info",
    {
      description: "Get Docker system information (version, containers, images, plugins, etc.).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const info = await getSystemInfo();
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to get system info: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_system_df",
    {
      description: "Show Docker disk usage (images, containers, volumes, build cache).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const df = await getSystemDf();
        return { content: [{ type: "text", text: JSON.stringify(df, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to get disk usage: ${message}` }], isError: true };
      }
    }
  );

  // ── Build tools ──────────────────────────────────────────────────────────

  server.registerTool(
    "docker_build",
    {
      description: "Build a Docker image from a local directory containing a Dockerfile. Returns the build output including image ID.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Path to the build context directory (must contain a Dockerfile)"),
        tag: z.string().optional().describe("Image tag (e.g. 'myapp:latest')"),
        dockerfile: z.string().optional().describe("Path to Dockerfile relative to context (default: Dockerfile)"),
        build_args: z.record(z.string()).optional().describe("Build arguments (ARG values)"),
      }),
    },
    async ({ path, tag, dockerfile, build_args }) => {
      try {
        const output = await buildImage(path, {
          tag,
          dockerfile,
          buildArgs: build_args,
        });
        return { content: [{ type: "text", text: output }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Build failed: ${message}` }], isError: true };
      }
    }
  );

  // ── Event tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "docker_events",
    {
      description: "Get Docker system events (container start/stop/create/destroy, image pull, etc.).",
      inputSchema: z.object({
        since: z.string().optional().describe("Show events since this timestamp (e.g. '2024-01-01T00:00:00Z' or '10m' or Unix timestamp)"),
        until: z.string().optional().describe("Show events until this timestamp then stop"),
        tail: z.number().int().min(1).max(500).optional().default(50).describe("Maximum number of recent events to return"),
      }),
    },
    async ({ since, until, tail }) => {
      try {
        // Default: last 5 minutes if no since specified
        const effectiveSince = since ?? Math.floor((Date.now() / 1000) - 300).toString();
        const events = await getEvents({ since: effectiveSince, until });

        if (events.length === 0) {
          return { content: [{ type: "text", text: "No events found." }] };
        }

        const sliced = events.slice(-tail);
        const lines = sliced.map((e) => {
          const time = new Date(e.time * 1000).toISOString();
          const actor = e.Actor?.ID?.substring(0, 12) ?? "";
          const attrs = e.Actor?.Attributes
            ? Object.entries(e.Actor.Attributes).map(([k, v]) => `${k}=${v}`).join(", ")
            : "";
          return `[${time}] ${e.Type} ${e.Action} ${actor}${attrs ? " (" + attrs + ")" : ""}`;
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to get events: ${message}` }], isError: true };
      }
    }
  );

  // ── Prune tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "docker_system_prune",
    {
      description: "Prune unused Docker objects (containers, images, networks). Optionally prune volumes too. Returns reclaimed space.",
      inputSchema: z.object({
        volumes: z.boolean().optional().default(false).describe("Also prune unused volumes (default: false)"),
      }),
    },
    async ({ volumes }) => {
      try {
        const result = await pruneSystem(volumes);
        const spaceMB = (result.SpaceReclaimed / (1024 * 1024)).toFixed(2);
        const parts: string[] = [`**Space reclaimed: ${spaceMB} MB**`];

        if (result.ContainersDeleted && result.ContainersDeleted.length > 0) {
          parts.push(`Containers deleted: ${result.ContainersDeleted.length}`);
        }
        if (result.ImagesDeleted && result.ImagesDeleted.length > 0) {
          parts.push(`Images deleted: ${result.ImagesDeleted.length}`);
        }
        if (result.VolumesDeleted && result.VolumesDeleted.length > 0) {
          parts.push(`Volumes deleted: ${result.VolumesDeleted.length}`);
        }

        return { content: [{ type: "text", text: parts.join("\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to prune: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_build_cache_prune",
    {
      description: "Clear Docker build cache. Returns reclaimed disk space.",
      inputSchema: z.object({
        all: z.boolean().optional().default(false).describe("Remove all cache, not just dangling (default: false)"),
      }),
    },
    async ({ all }) => {
      try {
        const result = await pruneBuildCache(all);
        const spaceMB = (result.SpaceReclaimed / (1024 * 1024)).toFixed(2);
        return { content: [{ type: "text", text: `Build cache pruned. Space reclaimed: ${spaceMB} MB` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to prune build cache: ${message}` }], isError: true };
      }
    }
  );

  // ── Container monitoring tools ────────────────────────────────────────────

  server.registerTool(
    "docker_container_stats",
    {
      description: "Get live resource usage stats for a container (CPU, memory, network I/O, block I/O) — like 'docker stats'.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
      }),
    },
    async ({ id }) => {
      try {
        const stats = await getContainerStats(id);

        const memUsage = stats.memory_stats?.usage ?? 0;
        const memLimit = stats.memory_stats?.limit ?? 1;
        const memPct = memLimit > 0 ? ((memUsage / memLimit) * 100).toFixed(1) : "0";
        const memUsageMB = (memUsage / (1024 * 1024)).toFixed(1);
        const memLimitMB = (memLimit / (1024 * 1024)).toFixed(1);

        const cpuUsage = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
        const sysCpu = stats.cpu_stats?.system_cpu_usage ?? 0;
        const onlineCpus = stats.cpu_stats?.online_cpus ?? 1;
        const cpuPct = sysCpu > 0 ? ((cpuUsage / sysCpu) * onlineCpus * 100).toFixed(1) : "0";

        const pids = stats.pids_stats?.current ?? 0;

        const netRx = Object.values(stats.networks ?? {}).reduce((sum, n) => sum + n.rx_bytes, 0);
        const netTx = Object.values(stats.networks ?? {}).reduce((sum, n) => sum + n.tx_bytes, 0);

        const lines = [
          `**Container Stats for ${id.substring(0, 12)}**`,
          `  CPU: ${cpuPct}%`,
          `  Memory: ${memUsageMB} MB / ${memLimitMB} MB (${memPct}%)`,
          `  PIDs: ${pids}`,
          `  Network I/O: ↓${(netRx / 1024).toFixed(1)} KB / ↑${(netTx / 1024).toFixed(1)} KB`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to get stats: ${message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "docker_container_logs_follow",
    {
      description: "Stream-follow container logs in real-time (like 'docker logs -f'). Collects logs for up to 10 seconds.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Container ID or name"),
        since: z.string().optional().describe("Show logs since this timestamp"),
        until: z.string().optional().describe("Show logs until this timestamp"),
        tail: z.number().int().min(1).max(10000).optional().default(100).describe("Number of lines from the end to start with"),
      }),
    },
    async ({ id, since, until, tail }) => {
      try {
        const logs = await getContainerLogsFollow(id, { since, until, tail });
        if (!logs.trim()) {
          return { content: [{ type: "text", text: "No logs found." }] };
        }
        return { content: [{ type: "text", text: logs }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Failed to follow logs: ${message}` }], isError: true };
      }
    }
  );

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
            version: "1.0.0",
            requiresApiKey: false,
            socketPath: config.socketPath,
            apiVersion: config.apiVersion,
            config: {
              timeoutMs: config.requestTimeoutMs,
            },
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (req.url === "/mcp" || req.url === "/") {
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
