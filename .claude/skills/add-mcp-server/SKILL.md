---
name: add-mcp-server
description: Scaffold a new MCP server following project patterns. Use when adding a new search or tool server to the hub.
argument-hint: <server-name> [port]
allowed-tools: Bash(mkdir *), Bash(cp *), Bash(cat *), Bash(echo *), Read, Write, Edit
---

# Add a New MCP Server

Scaffold a new MCP server following the project patterns.

## Usage

\`/add-mcp-server brave-search 3003\` - Create a new server named "brave-search" on port 3003

## Steps

### 1. Copy the template

\`\`\`bash
cp -r servers/duckduckgo-search servers/$ARGUMENTS
\`\`\`

### 2. Update package.json

In \`servers/$ARGUMENTS/package.json\`:
- Change \`"name"\` to \`@mcp-hub/$ARGUMENTS\`
- Update \`"version"\` if needed

### 3. Update config.ts

In \`servers/$ARGUMENTS/src/config.ts\`:
- Change the port to the next available (e.g., 3003)
- Add any new environment variables

### 4. Add Dockerfile

\`\`\`bash
mkdir -p docker/$ARGUMENTS
cp docker/duckduckgo-search/Dockerfile docker/$ARGUMENTS/Dockerfile
\`\`\`

Edit the Dockerfile to update the workspace path and port.

### 5. Register in docker-compose.yml

Add service entry following the \`duckduckgo-search\` pattern.

### 6. Update documentation

Add the server to tables in \`CLAUDE.md\` and \`README.md\`.

### 7. Test the server

\`\`\`bash
cd servers/$ARGUMENTS && npm run dev
curl http://localhost:3003/health
\`\`\`

---

**Next steps after scaffolding:**
1. Update \`src/index.ts\` to register your actual tools
2. Create tool files in \`src/tools/\` following the pattern
3. Add any required API clients in \`src/\`