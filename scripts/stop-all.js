#!/usr/bin/env node
/**
 * Stop all MCP servers.
 * Usage: node scripts/stop-all.js
 */

import { exec } from "child_process";

const SERVERS = ["fetch", "filesystem", "browser", "duckduckgo-search", "memory"];

function stopServer(name) {
  console.log(`Stopping ${name}...`);
  // Kill both tsx watch (dev mode) and dist/index.js (built) processes
  exec(`pkill -f "${name}/dist/index.js|tsx.*${name}|node.*${name}.*stdio"`, (err) => {
    if (err && err.code !== 1) {
      console.error(`Failed to stop ${name}: ${err.message}`);
    } else {
      console.log(`✓ ${name} stopped`);
    }
  });
}

console.log("Stopping MCP servers...\n");
SERVERS.forEach(stopServer);