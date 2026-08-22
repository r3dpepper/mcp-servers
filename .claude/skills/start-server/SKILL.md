---
name: start-server
description: Start a specific MCP server with health checks. Use when needing to run a server for testing or development.
argument-hint: <server-name>
allowed-tools: Bash(npm *), Bash(node *), Bash(lsof *), Bash(pkill *)
---

# Start MCP Server

Start a specific MCP server and verify it's running correctly.

## Usage

\`/start-server ddg-search\` - Start the DuckDuckGo search server on port 3002

## Available Servers

- \`ddg-search\` - DuckDuckGo search MCP server (port 3002)

## Instructions

1. Check if the server is already running on its default port
2. Navigate to the server directory and start it
3. Wait for the server to be ready
4. Verify health endpoint responds

For server name $ARGUMENTS:

### Step 1: Check if already running

\`\`\`bash
lsof -ti:3002 2>/dev/null || echo "Port available"
\`\`\`

### Step 2: Start the server

\`\`\`bash
cd servers/ddg-search && npm run dev
\`\`\`

### Step 3: Verify health

\`\`\`bash
curl -s http://localhost:3002/health
\`\`\`

If port is in use, kill the process first or use a different port via env variable.