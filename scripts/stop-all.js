#!/usr/bin/env node
/**
 * Stop all MCP servers.
 * Usage: node scripts/stop-all.js
 */

import { exec } from "child_process";

const SERVERS = ["fetch", "filesystem", "browser", "duckduckgo-search", "memory"];

function stopServer(name) {
  console.log(`Stopping ${name}...`);
  exec(`pkill -f "node.*${name}/dist/index.js|node.*${name}/src/index.js"`, (err) => {
    if (err && err.code !== 1) {
      console.error(`Failed to stop ${name}: ${err.message}`);
    } else {
      console.log(`✓ ${name} stopped`);
    }
  });
}

console.log("Stopping MCP servers...\n");
SERVERS.forEach(stopServer);