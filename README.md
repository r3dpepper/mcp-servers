# MCP Hub

A multi-server MCP (Model Context Protocol) hub that exposes various tools to AI assistants. Each server is independently deployable and can be enabled/disabled as needed.

## Available Servers

| Server | Port | Tools | API Key Required | Features |
|--------|------|-------|------------------|----------|
| `ddg-search` | 3002 | `ddg_search`, `ddg_instant_answer` | No | Rate limiting, caching, retry logic |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No | - |
| `filesystem` | 3004 | `read_file`, `write_file`, `list_directory`, `create_directory`, `delete_file`, `list_allowed_directories` | No | CORS support |
| `fetch` | 3005 | `fetch_url` | No | Security hardening, timeout protection, retry logic, HTML→markdown conversion, paginated reads (`max_length`/`start_index`) |
| `memory` | 3006 | `memory_write`, `memory_read`, `memory_manage` | No | Persistent knowledge graph, ranked search, bidirectional traversal |
| `docker` | 3007 | 30 tools — containers, images, volumes, networks, exec (opt-in), build, events, prune, system info/df, stats, logs | No | Unix socket connection, retry logic, TTL caching, rate limiting, output truncation |
| `playwright` *(external)* | 3008 | 24 tools — accessibility-tree browser automation: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_tabs`, `browser_take_screenshot`, … | No | Published npm package (`@playwright/mcp`), version-pinned; see [docs/adding-external-server.md](./docs/adding-external-server.md) |

## Quick Start

### MCP Server Management (Automated)

Use the management script to add/remove all servers with proper transport naming:

```bash
# Make executable (one-time)
chmod +x scripts/manage-mcp-servers.sh

# Remove all existing servers
./scripts/manage-mcp-servers.sh remove

# Add all servers with HTTP transport (named *-http)
./scripts/manage-mcp-servers.sh add-http

# Add all servers with stdio transport (named *-stdio) - requires build first
./scripts/manage-mcp-servers.sh add-stdio

# Add both HTTP and stdio transports
./scripts/manage-mcp-servers.sh add-all

# List currently configured servers
./scripts/manage-mcp-servers.sh list

# Check which servers are currently running (HTTP health check)
./scripts/manage-mcp-servers.sh status

# Start servers that are not running / stop servers that are running
./scripts/manage-mcp-servers.sh start
./scripts/manage-mcp-servers.sh stop

# Restart all servers, or just one by name
./scripts/manage-mcp-servers.sh restart
./scripts/manage-mcp-servers.sh restart memory
```

**Server naming convention:**
- HTTP: `ddg-search-http`, `browser-http`, `filesystem-http`, `fetch-http`, `memory-http`, `docker-http`
- Stdio: `ddg-search-stdio`, `browser-stdio`, `filesystem-stdio`, `fetch-stdio`, `memory-stdio`, `docker-stdio`

---

### Stdio Transport (Recommended for Claude Code)

The Claude Code CLI has known issues with HTTP/SSE transport where headers are stripped. Use stdio transport instead:

```bash
# 1. Install all dependencies
npm install

# 2. Build all servers
npm run build

# 3. Add servers to Claude Code
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

### HTTP Transport

```bash
# 1. Install all dependencies
npm install

# 2. Copy environment template (must be named `.env` — servers load dotenv from `.env`)
cp .env.example .env

# 3. Start all enabled servers
npm run dev
```

Servers will be available at their respective ports (e.g., `http://localhost:3002/mcp` for DuckDuckGo Search).

## Stopping Servers

| Script          | Stops                  |
|-----------------|------------------------|
| `npm run stop`  | All MCP servers        |
| `npm run stop-browser` | Only the browser server |
| `npm run stop-filesystem` | Only the filesystem server |
| `npm run stop-fetch` | Only the fetch server |
| `npm run stop-memory` | Only the memory server |

## Adding a New Server

See [docs/adding-new-server.md](./docs/adding-new-server.md) for detailed instructions.

```bash
# Copy the template
cp -r servers/ddg-search servers/my-new-server

# Update package.json name and config
# Update scripts/start-all.js to register it
# Add Dockerfile in docker/my-new-server/
```

## Docker Deployment

```bash
# Start all servers via Docker Compose
docker compose --env-file .env.local up --build

# Start a single server
docker compose --env-file .env.local up ddg-search
```

## Project Structure

```
.
├── servers/              # Individual MCP servers
│   ├── ddg-search/
│   ├── browser/
│   ├── filesystem/
│   ├── fetch/
│   ├── memory/
│   └── docker/
├── docker/               # Dockerfiles for each server
├── scripts/              # Development utilities
│   ├── start-all.js      # Start all servers (HTTP mode)
│   ├── stop-all.js       # Stop all servers
│   ├── stop-memory.js    # Stop memory server
│   ├── stop-browser.js   # Stop browser server
│   ├── stop-filesystem.js # Stop filesystem server
│   ├── stop-fetch.js     # Stop fetch server
│   ├── test-browser-tools.js # Test browser tools
│   └── manage-mcp-servers.sh # Add/remove MCP servers in Claude Code
├── docker-compose.yml      # Multi-server orchestration
└── docs/
    └── adding-new-server.md    # Guide for adding servers
```

## License

MIT