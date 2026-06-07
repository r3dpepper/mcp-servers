#!/usr/bin/env node
/**
 * Start all enabled MCP servers locally.
 *
 * Usage: node scripts/start-all.js [--stdio]
 *
 * Servers are started with `npm run start` (stdio) or `npm run dev` (HTTP) in their respective directories.
 * Each server runs in its own subprocess with colored output.
 *
 * --stdio: Start servers in stdio mode (recommended for Claude Code CLI)
 */

import { spawn } from "child_process";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const useStdio = process.argv.includes("--stdio");

const SERVERS = [
  {
    name: "duckduckgo-search",
    enabledEnv: "DUCKDUCKGO_SEARCH_ENABLED",
    defaultEnabled: true,
    dir: resolve(ROOT, "servers/duckduckgo-search"),
    color: "\x1b[36m", // cyan
  },
  {
    name: "browser",
    enabledEnv: "BROWSER_ENABLED",
    defaultEnabled: true,
    dir: resolve(ROOT, "servers/browser"),
    color: "\x1b[35m", // magenta
  },
  {
    name: "filesystem",
    enabledEnv: "FILESYSTEM_ENABLED",
    defaultEnabled: true,
    dir: resolve(ROOT, "servers/filesystem"),
    color: "\x1b[33m", // yellow
  },
  {
    name: "fetch",
    enabledEnv: "FETCH_ENABLED",
    defaultEnabled: true,
    dir: resolve(ROOT, "servers/fetch"),
    color: "\x1b[32m", // green
  },
  {
    name: "memory",
    enabledEnv: "MEMORY_ENABLED",
    defaultEnabled: true,
    dir: resolve(ROOT, "servers/memory"),
    color: "\x1b[35m", // magenta
  },
];

function startServer(server) {
  const enabled = process.env[server.enabledEnv] ?? server.defaultEnabled;
  if (!enabled) {
    console.log(`${server.color}⊘ ${server.name}\x1b[0m (disabled)`);
    return;
  }

  console.log(`${server.color}▶ ${server.name}\x1b[0m starting...`);

  const env = useStdio
    ? { ...process.env, TRANSPORT: "stdio" }
    : process.env;

  // Use 'npm run start' for stdio (uses built dist/index.js)
  // Use 'npm run dev' for HTTP (uses tsx watch for hot reload)
  const npmScript = useStdio ? "start" : "dev";

  const proc = spawn(`npm run ${npmScript}`, {
    cwd: server.dir,
    shell: true,
    stdio: useStdio ? "inherit" : ["ignore", "pipe", "pipe"],
    env,
  });

  // Only attach event handlers for non-stdio mode (where stdio is piped)
  if (!useStdio) {
    proc.stdout.on("data", (data) => {
      process.stdout.write(`${server.color}[${server.name}]\x1b[0m ${data}`);
    });

    proc.stderr.on("data", (data) => {
      process.stderr.write(`${server.color}[${server.name}]\x1b[0m ${data}`);
    });
  }

  proc.on("exit", (code) => {
    if (code !== null) {
      console.log(`${server.color}[${server.name}]\x1b[0m exited with code ${code}`);
    }
  });
}

console.log("Starting MCP servers...\n");
SERVERS.forEach(startServer);

function shutdown() {
  console.log("\nShutting down servers...");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);