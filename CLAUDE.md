# CLAUDE.md — MCP Hub

> This file is read automatically by **Claude Code**. It tells Claude how this
> project is structured, what commands to use, and how to make changes safely.

---

## Project overview

This is a **multi-server MCP Hub** that hosts independently deployable MCP servers. Each server lives in `servers/<name>/` and can be enabled/disabled individually.

**Running servers:**

| Server | Port | Tools | API Key |
|--------|------|-------|---------|
| `ddg-search` | 3002 | `ddg_search`, `ddg_instant_answer` | No |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No |
| `filesystem` | 3004 | `filesystem_list_allowed` (wrapper) | No |
| `fetch` | 3005 | `fetch_url` | No |
| `memory` | 3006 | `memory_write`, `memory_read`, `memory_manage` | No |
| `docker` | 3007 | `docker_containers_list`, `docker_container_inspect`, `docker_container_logs`, `docker_container_logs_follow`, `docker_container_stats`, `docker_container_start`, `docker_container_stop`, `docker_container_restart`, `docker_container_remove`, `docker_images_list`, `docker_image_inspect`, `docker_image_remove`, `docker_build`, `docker_events`, `docker_system_info`, `docker_system_df`, `docker_system_prune`, `docker_build_cache_prune` | No |

---

## Tech stack

- **Runtime**: Node.js ≥ 18 (ESM)
- **Language**: TypeScript 5
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Validation**: `zod`
- **Package manager**: npm workspaces

---

## Repository layout

```
.
├── servers/                          ← Individual MCP servers
│   └── ddg-search/
│       ├── src/
│       │   ├── index.ts              ← Server entry
│       │   ├── config.ts             ← Environment config
│       │   ├── duckduckgo-client.ts  ← API client + HTML parsing
│       │   ├── logger.ts             ← Logging
│       │   ├── rate-limiter.ts       ← Request rate limiting
│       │   ├── cache.ts              ← TTL-based result caching
│       │   ├── retry.ts              ← Exponential backoff
│       │   └── tools/                ← Tool definitions
│       ├── package.json
│       └── tsconfig.json
├── docker/                           ← Dockerfiles per server
├── scripts/
│   ├── start-all.js                  ← Local dev: starts all servers
│   ├── stop-all.js                   ← Stops all running servers
│   ├── stop-memory.js                ← Stops only the memory server
│   ├── stop-browser.js               ← Stops only the browser server
│   ├── stop-filesystem.js            ← Stops only the filesystem server
│   ├── stop-fetch.js                 ← Stops only the fetch server
│   ├── test-browser-tools.js         ← Tests browser MCP tools
│   └── manage-mcp-servers.sh         ← Manage MCP servers in Claude Code (add/remove HTTP & stdio)
├── docker-compose.yml                ← Docker orchestration
├── docs/                             ← Documentation
│   └── adding-new-server.md          ← Guide for new servers
└── .env.example                      ← Environment template
```

---

## Common development commands

```bash
# Install dependencies (all workspaces)
npm install

# Build all servers (required before stdio mode)
npm run build

# Start all servers (HTTP mode)
npm run dev

# Start all servers (Stdio mode - recommended for Claude Code CLI)
npm run dev:stdio

# Stop all running servers
npm run stop

# Stop a specific server
npm run stop-browser      # Stop only the browser server
npm run stop-filesystem   # Stop only the filesystem server
npm run stop-fetch        # Stop only the fetch server
npm run stop-memory       # Stop only the memory server

# Start a single server (for testing)
cd servers/ddg-search && npm run dev
```

## MCP Server Management Script

The `scripts/manage-mcp-servers.sh` script automates adding/removing MCP servers in Claude Code with both HTTP and stdio transports. Server names include the transport suffix (`-http` or `-stdio`) for easy identification.

```bash
# Make executable (one-time)
chmod +x scripts/manage-mcp-servers.sh

# Remove all MCP servers (both -http and -stdio variants)
./scripts/manage-mcp-servers.sh remove

# Add all servers with HTTP transport (named *-http)
./scripts/manage-mcp-servers.sh add-http

# Add all servers with stdio transport (named *-stdio) - requires build first
./scripts/manage-mcp-servers.sh add-stdio

# Add both HTTP and stdio transports
./scripts/manage-mcp-servers.sh add-all

# List currently configured servers
./scripts/manage-mcp-servers.sh list

# Check which servers are currently running (HTTP health check per port)
./scripts/manage-mcp-servers.sh status

# Start servers that are not running / stop servers that are running
./scripts/manage-mcp-servers.sh start
./scripts/manage-mcp-servers.sh stop

# Restart all servers, or just one by name (stop if running, then start)
./scripts/manage-mcp-servers.sh restart
./scripts/manage-mcp-servers.sh restart memory
```

**Server naming convention:**
- HTTP: `ddg-search-http`, `browser-http`, `filesystem-http`, `fetch-http`, `memory-http`, `docker-http`
- Stdio: `ddg-search-stdio`, `browser-stdio`, `filesystem-stdio`, `fetch-stdio`, `memory-stdio`, `docker-stdio`

> **Note:** When adding new MCP servers, update the `SERVERS` array in `scripts/manage-mcp-servers.sh` to include the new server name and port.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DDG_PORT` | 3002 | DuckDuckGo server port |
| `DDG_MAX_RESULTS` | 10 | Max results per search (max: 50) |
| `DDG_TIMEOUT_MS` | 10000 | Request timeout in milliseconds |
| `DDG_RATE_LIMIT_PER_MINUTE` | 10 | Rate limit for search requests |
| `DDG_CACHE_TTL_SECONDS` | 300 | Search result cache TTL (5 minutes) |
| `MEMORY_PORT` | 3006 | Memory server port |
| `MEMORY_DB_PATH` | `~/.mcp-servers/memory.db` | Path to memory database file |
| `MEMORY_NAMESPACE` | `default` | Namespace for memory entities |
| `TRANSPORT` | `http` | `http` or `stdio` - controls transport mode for all servers |
| `NODE_ENV` | development | Environment |
| `LOG_LEVEL` | info | Logging level |
| `FETCH_PORT` | 3005 | Fetch server port |
| `FETCH_TIMEOUT_MS` | 30000 | Fetch request timeout |
| `FETCH_MAX_URL_LENGTH` | 2048 | Maximum URL length allowed |
| `FETCH_MAX_CONTENT_LENGTH` | 1048576 | Maximum response size (1MB) |
| `FETCH_USER_AGENT` | MCP-Fetch-Server/1.0 | User agent header |
| `DOCKER_PORT` | 3007 | Docker server port |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Path to Docker Unix socket |
| `DOCKER_API_VERSION` | `v1.47` | Docker Engine API version |
| `DOCKER_TIMEOUT_MS` | 10000 | Docker API request timeout |
| `DOCKER_BUILD_TIMEOUT_MS` | 600000 | Image build request timeout |
| `DOCKER_CACHE_TTL_SECONDS` | 30 | TTL for cached read-only results (lists, inspects, system info) |
| `DOCKER_RATE_LIMIT_PER_MINUTE` | 120 | Per-client HTTP rate limit (HTTP transport only) |
| `DOCKER_MAX_OUTPUT_BYTES` | 65536 | Max tool output size before truncation |

---

## Code conventions

- All source files use **ESM** (`import`/`export`), not `require`
- Import paths end with `.js` (TypeScript ESM resolution)
- Each tool is its own file in `src/tools/`, re-exported from `tools/index.ts`
- `config.ts` in each server is the only place env vars are read
- Use `logger` from `logger.ts`, never `console.log` directly
- Use `zod` for all input validation
- **Tool names must stay under 64 characters** — some MCP clients truncate tool names around that limit. Clients also prefix tools (`mcp__<server-name>__<tool>`), so keep both server and tool names short

---

## Server features

### DuckDuckGo Search
- **Rate limiting**: Prevents abuse (configurable per client)
- **Caching**: TTL-based query result caching (default 5 minutes)
- **Retry logic**: Exponential backoff for transient failures
- **HTML parsing**: Uses linkedom for reliable search result extraction
- **CORS support**: Cross-origin requests enabled for HTTP transport

### Fetch
- **Security hardening**: URL scheme validation (http/https only), content type checks
- **Timeout protection**: Configurable request timeouts
- **Size limits**: Response size and URL length limits enforced
- **Retry logic**: Automatic retry with exponential backoff
- **CORS support**: Cross-origin requests enabled

### Filesystem
- **CORS support**: Cross-origin requests enabled
- **Accept header validation**: Ensures proper MCP protocol compliance

### Docker
- **Unix socket connection**: Communicates with Docker Engine API via `/var/run/docker.sock`
- **Container management**: List, inspect, start, stop, restart, remove containers
- **Image management**: List, inspect, remove images
- **Build**: Build images from local directories containing Dockerfiles
- **System info**: Docker version, containers, images, plugins, disk usage
- **System events**: Monitor container/image lifecycle events in real-time
- **Pruning**: Clean up unused containers, images, networks, volumes, and build cache
- **Monitoring**: Live container resource stats (CPU, memory, network I/O) and log following
- **Configurable API version**: Supports different Docker Engine API versions
- **Retry with backoff**: Connect-phase failures always retried; client timeouts and 5xx responses retried only for read-only (GET) calls
- **TTL caching**: Lists, inspects, and system info cached briefly; entire cache invalidated on every successful mutation
- **Rate limiting**: Per-client HTTP rate limit protects the daemon from runaway clients (HTTP transport only)
- **Output truncation**: Tool output capped at `DOCKER_MAX_OUTPUT_BYTES` so huge logs/inspects cannot blow up LLM context windows

## Testing a tool manually

```bash
# Health check
curl http://localhost:3002/health

# Test search
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ddg_search","arguments":{"query":"TypeScript MCP"}}}'
```

---

## Connecting to Claude Code

**Important:** The Claude Code CLI has known issues with HTTP/SSE transport where headers (including Accept headers) are stripped by the Bun runtime. For reliable connections, use **Stdio transport** instead.

### Stdio Transport (Recommended)

Run servers locally using Stdio transport, which bypasses HTTP header issues:

```bash
# Using environment variables for stdio mode
TRANSPORT=stdio npm run dev --workspace=@mcp-hub/memory
```

Or register via Claude CLI with `claude mcp add`:

```bash
# Build first (required for stdio)
npm run build

# Add servers via CLI (stdio transport)
claude mcp add ddg-search --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/ddg-search/dist/index.js

claude mcp add browser --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/browser/dist/index.js

claude mcp add filesystem --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/filesystem/dist/index.js

claude mcp add fetch --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/fetch/dist/index.js

claude mcp add memory --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/memory/dist/index.js

claude mcp add docker --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/docker/dist/index.js
```

Or configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "ddg-search": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/ddg-search/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    },
    "browser": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/browser/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    },
    "filesystem": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/filesystem/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    },
    "fetch": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/fetch/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    },
    "memory": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/memory/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    },
    "docker": {
      "command": "node",
      "args": ["/Users/jignesh/Learning/projects/mcp-servers/servers/docker/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    }
  }
}
```

### HTTP Transport

Register the MCP servers with Claude Code using the `claude mcp add` command:

```bash
# DuckDuckGo Search
claude mcp add ddg-search --transport http --scope user http://localhost:3002/mcp

# Browser Automation
claude mcp add browser --transport http --scope user http://localhost:3003/mcp

# Filesystem
claude mcp add filesystem --transport http --scope user http://localhost:3004/mcp

# Fetch
claude mcp add fetch --transport http --scope user http://localhost:3005/mcp

# Memory
claude mcp add memory --transport http --scope user http://localhost:3006/mcp

# Docker
claude mcp add docker --transport http --scope user http://localhost:3007/mcp
```

**Note:** HTTP transport requires proper Accept headers (`application/json` or `text/event-stream`). If you encounter connection issues, switch to Stdio transport.

---

## Commit conventions

- Do not add `Co-Authored-By` trailer to commit messages
- Write clear, descriptive commit messages in present tense

## When updating docs

- Keep this `CLAUDE.md` in sync after every structural change
- `README.md` is the public-facing summary
- `docs/adding-new-server.md` contains the guide for adding new servers