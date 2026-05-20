# Adding a New MCP Server

This guide explains how to add a new MCP server to the hub, following the
exact same patterns as `duckduckgo-search`.

---

## Overview

Adding a server involves 4 things:

| # | What | Where |
|---|------|-------|
| 1 | Server source code | `servers/<name>/` |
| 2 | Docker image | `docker/<name>/Dockerfile` |
| 3 | Register in start-all.js | `scripts/start-all.js` |
| 4 | Register in docker-compose.yml | `docker-compose.yml` |

---

## Step 1 — Copy the template

The fastest way to start is to copy the `duckduckgo-search` server:

```bash
cp -r servers/duckduckgo-search servers/<your-server-name>
```

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

## Step 2 — Build your tools

Each tool is a file in `src/tools/`. A tool has four parts:

```typescript
export const myTool = {
  // 1. The name Claude will see and call
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

## Step 3 — Write an API client (if needed)

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
cp docker/duckduckgo-search/Dockerfile docker/<your-server-name>/Dockerfile
```

Edit the Dockerfile:
- Update the workspace path: `servers/duckduckgo-search` → `servers/<your-server-name>`
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

## Step 7 — Update documentation

Update the server tables in `CLAUDE.md` and `README.md`:

```markdown
| Server | Port | Tools |
|--------|------|-------|
| `duckduckgo-search` | 3002 | `duckduckgo_search`, `duckduckgo_instant_answer` |
| `your-server` | 3003 | `your_tool_1`, `your_tool_2` |
```

---

## Test your new server

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

## Ideas for servers to add

| Server | Port | Suggested tools |
|--------|------|----------------|
| `brave-search` | 3003 | `brave_search`, `brave_news` |
| `github` | 3004 | `search_repos`, `get_issue`, `list_prs` |
| `slack` | 3005 | `send_message`, `list_channels`, `search_messages` |
| `filesystem` | 3006 | `read_file`, `write_file`, `list_directory` |
| `postgres` | 3007 | `run_query`, `list_tables`, `describe_table` |
| `weather` | 3008 | `get_current_weather`, `get_forecast` |