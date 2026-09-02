# Adding a New MCP Server - Comprehensive Guide

This guide explains how to add a new MCP server to the hub, following the exact same patterns as `ddg-search`, with additional considerations for design, optimization, and verification.

> Wrapping an **existing published MCP package** instead of writing our own?
> Follow [adding-external-server.md](./adding-external-server.md) instead.

---

## Overview

Adding a server involves 4 core things:
1. Server source code (`servers/<name>/`)
2. Docker image (`docker/<name>/Dockerfile`)
3. Registration in start-all.js (`scripts/start-all.js`)
4. Registration in docker-compose.yml (`docker-compose.yml`)

Plus documentation updates and verification steps.

---

## Design Considerations

Before starting, consider these architectural decisions that make MCP servers maintainable and efficient:

### Key Design Decisions
- **Modularity**: Separate concerns (configuration, logging, core logic, tools) for maintainability.
- **Transport Agnosticism**: The server supports both STDIO (local) and HTTP (remote) via `TRANSPORT` env var.
- **Error Handling**: Tools return structured errors (`isError: true`) instead of throwing.
- **Validation**: All tool inputs validated with Zod schemas.
- **Logging**: Uses a structured logger (JSON in production, human-readable in development).
- **Resource Efficiency**: Avoids heavy dependencies; uses lightweight HTTP clients (e.g., native `fetch` or `undici`).

### Server Component Interaction
```mermaid
graph TD
    A[MCP Client (e.g., Claude Code)] -->|JSON-RPC 2.0| B(MCP Server)
    B --> C[Server Entry Point (index.ts)]
    C --> D[Tool Registration]
    D --> E[Tool 1: <tool-name>]
    D --> F[Tool 2: <another-tool>]
    E --> G[Core Logic: <server-name>-client.ts]
    F --> G
    G --> H[External API/Service]
    C --> I[Configuration: config.ts]
    C --> J[Logging: logger.ts]
    I --> K[Environment Variables]
    J --> L[Log Output]
```

---

## Step 1 — Copy the Template

The fastest way to start is to copy the `ddg-search` server:

```bash
# Copy the entire server directory
cp -r servers/ddg-search servers/<your-server-name>
```

**Important:** Keep the `.env.example` file in the project root to maintain centralized environment configuration. Do NOT copy it to individual server directories.

Then rename the package in `servers/<your-server-name>/package.json`:

```json
{
  "name": "@mcp-hub/<your-server-name>",
  ...
}
```

Update the port in `src/config.ts`:
```typescript
port: optionalEnvInt("YOUR_SERVER_PORT", 3003),   // ← new unique port
```

---

## Step 2 — Build Your Tools

Each tool is a file in `src/tools/`. A tool has four parts:

```typescript
export const myTool = {
  // 1. The name Claude will see and call
  //    MUST stay under 64 characters (some MCP clients truncate tool names
  //    around that limit). Clients also prefix it: mcp__<server-name>__<tool>,
  //    so keep server and tool names short.
  name: "my_tool_name",

  // 2. Description — be clear and specific
  description: "Does X when Y. Returns Z.",

  // 3. Input schema — validated by Zod
  schema: {
    param1: z.string().describe("What this parameter does"),
    param2: z.number().optional().default(10).describe("Optional number"),
  },

  // 4. Handler — the actual logic
  handler: async (args: { param1: string; param2?: number }) => {
    try {
      const result = await callYourAPI(args.param1);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
};
```

**Tips for writing good tools:**

- **One responsibility per tool.** Don't make a giant tool that does everything.
- **Rich descriptions.** The model decides which tool to call based on the description.
- **Always handle errors** and return `isError: true` — don't throw.
- **Use `zod` for all inputs** — it provides runtime validation.
- **Return structured text** with markdown formatting.

### Registering the tool in src/index.ts

```typescript
import { myTool } from "./tools/index.js";

server.tool(
  myTool.name,
  myTool.description,
  myTool.schema,
  myTool.handler
);
```

And export it from `src/tools/index.ts`:

```typescript
export { myTool } from "./my-tool.js";
```

---

## Step 3 — Write an API Client (if needed)

If your server calls an external API, create `src/<service>-client.ts`. Keep it separate from tool logic.

Good patterns:
- Accept a typed `params` object
- Use `logger.debug()` for request logging
- Convert API errors into thrown `Error` objects
- Return typed interfaces (not raw `any`)

---

## Step 4 — Add a Dockerfile

```bash
mkdir -p docker/<your-server-name>
cp docker/ddg-search/Dockerfile docker/<your-server-name>/Dockerfile
```

Edit the Dockerfile:
- Update the workspace path: `servers/ddg-search` → `servers/<your-server-name>`
- Update the exposed port

---

## Step 5 — Register in scripts/start-all.js

Add your server to the `SERVERS` array:

```javascript
{
  name: "your-server",
  enabledEnv: "YOUR_SERVER_ENABLED",
  defaultEnabled: true,
  dir: resolve(ROOT, "servers/your-server"),
  color: "\x1b[33m",  // yellow — pick a unique color
},
```

---

## Step 6 — Register in docker-compose.yml

Add your service:

```yaml
your-server:
  build:
    context: .
    dockerfile: docker/your-server/Dockerfile
  container_name: mcp-your-server
  restart: unless-stopped
  ports:
    - "${YOUR_SERVER_PORT:-3003}:3003"
  environment:
    - NODE_ENV=${NODE_ENV:-development}
    - YOUR_API_KEY=${YOUR_API_KEY}
    - TRANSPORT=http
```

---

## Step 7 — Update MCP Server Management Script

Update the `SERVERS` array in `scripts/manage-mcp-servers.sh` to include your new server:

```bash
SERVERS=(
    "ddg-search:3002"
    "browser:3003"
    "filesystem:3004"
    "fetch:3005"
    "memory:3006"
    "docker:3007"
    "your-server:3008"   # ← Add new server here with its port
)
```

This script automatically handles adding/removing servers with both HTTP and stdio transports in Claude Code.

---

## Step 8 — Update Documentation

Update the server tables in `CLAUDE.md` and `README.md`:

```markdown
| Server | Port | Tools |
|--------|------|-------|
| `ddg-search` | 3002 | `ddg_search`, `ddg_instant_answer` |
| `your-server` | 3003 | `your_tool_1`, `your_tool_2` |
```

---

## Step 8 — Optimization for Resource Constraints (M1 Mac 16GB RAM)

To respect memory limitations:

### Dependency Audit
- Ensure `package.json` only includes necessary dependencies
- Avoid heavy libraries like Chromium puppeteer unless essential
- Prefer native `fetch` or lightweight `undici` over bulky HTTP clients

### Lazy Loading
- Initialize resources (e.g., database connections) only when needed
- Don't create expensive objects at startup unless required

### Caching
- Implement in-memory caching for frequent requests (e.g., using simple Map with TTL)
- Reduces external API calls and improves response times

### Connection Pooling
- Reuse HTTP client instances instead of creating new ones per request
- Use connection pools where appropriate

### Resource Monitoring
- Add basic memory usage logging in development to catch leaks early
- Monitor with `process.memoryUsage()` in Node.js

---

## Step 9 — Test Your New Server

```bash
# Start just your server
cd servers/your-server && npm run dev

# Health check
curl http://localhost:3003/health

# Call a tool
curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "your_tool_name",
      "arguments": { "param1": "test value" }
    }
  }' | jq
```

---

## Step 10 — Test in Claude Code

```bash
claude mcp add your-server --transport http --scope user http://localhost:3003/mcp
```

Verify the tools are discoverable and functional in Claude Chat.

---

## Verification Checklist

Before considering the task complete, verify:

- [ ] All linting passes (`npm run lint` if configured)
- [ ] Server builds successfully (`npm run build`)
- [ ] Health check endpoint returns 200 OK
- [ ] Each tool returns expected responses for valid inputs
- [ ] Tools return structured errors (`isError: true`) for invalid inputs
- [ ] Server starts and shuts down gracefully with SIGINT/SIGTERM
- [ ] Server works in both HTTP and STDIO transports (test by setting `TRANSPORT=stdio`)
- [ ] Every tool name is under 64 characters (some MCP clients truncate around that limit)
- [ ] Docker container builds and runs successfully (if Docker support added)
- [ ] Server is discoverable and usable in Claude Code after adding via `claude mcp add`
- [ ] No excessive memory usage observed during testing
- [ ] `./scripts/manage-mcp-servers.sh add-http` adds the new server correctly (named `your-server-http`)
- [ ] `./scripts/manage-mcp-servers.sh add-stdio` adds the new server correctly (named `your-server-stdio`)
- [ ] `./scripts/manage-mcp-servers.sh remove` removes all server variants

---

## Ideas for Servers to Add

| Server | Port | Suggested Tools |
|--------|------|----------------|
| `brave-search` | 3004 | `brave_search`, `brave_news` |
| `github` | 3005 | `search_repos`, `get_issue`, `list_prs` |
| `slack` | 3006 | `send_message`, `list_channels`, `search_messages` |
| `filesystem` | 3007 | `read_file`, `write_file`, `list_directory` |
| `postgres` | 3008 | `run_query`, `list_tables`, `describe_table` |
| `weather` | 3009 | `get_current_weather`, `get_forecast` |
| `browser` | 3010 | `screenshot`, `navigate`, `click`, `fill_form` |

---

## Notes

- Replace `<server-name>`, `<tool-name>`, etc., with actual names during implementation.
- Follow the project's commit conventions when saving changes.
- Keep the server focused: one well-defined purpose per server is better than a jack-of-all-trades.
- This guide combines practical steps with architectural considerations to help you create robust, efficient MCP servers.

This document serves as both a step-by-step guide and a reference for best practices when adding new MCP servers to the hub.