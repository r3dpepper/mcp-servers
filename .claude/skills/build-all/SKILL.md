---
name: build-all
description: Build all servers in the workspace using npm workspaces. Use after code changes to verify builds.
allowed-tools: Bash(npm *), Bash(node *)
---

# Build All Servers

Build all MCP servers in the workspace.

## Commands

\`\`\`bash
# Install dependencies first
npm install

# Build all servers
npm run build

# Build a specific server
cd servers/duckduckgo-search && npm run build
\`\`\`

## Verification

After building, verify each server can start:
- Check \`dist/\` directory exists in each server folder
- Try starting each server to confirm no runtime errors