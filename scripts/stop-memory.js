#!/usr/bin/env node
import { exec } from "child_process";

console.log("Stopping memory server...");
exec(`pkill -f "node.*memory"`, (err) => {
  if (err && err.code !== 1) {
    console.error(`Failed to stop memory: ${err.message}`);
  } else {
    console.log("✓ memory stopped");
  }
});