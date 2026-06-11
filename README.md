# MCP Hub

A multi-server MCP (Model Context Protocol) hub that exposes various tools to AI assistants. Each server is independently deployable and can be enabled/disabled as needed.

## Available Servers

| Server | Port | Tools | API Key Required | Features |
|--------|------|-------|------------------|----------|
| `duckduckgo-search` | 3002 | `duckduckgo_search`, `duckduckgo_instant_answer` | No | Rate limiting, caching, retry logic |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No | - |
| `filesystem` | 3004 | `read_file`, `write_file`, `list_directory`, `create_directory`, `delete_file`, `list_allowed_directories` | No | CORS support |
| `fetch` | 3005 | `fetch_url` | No | Security hardening, timeout protection, retry logic |
| `memory` | 3006 | `memory_write`, `memory_read`, `memory_manage` | No | Persistent knowledge graph |
| `docker` | 3007 | `docker_containers_list`, `docker_container_inspect`, `docker_container_logs`, `docker_container_start`, `docker_container_stop`, `docker_container_restart`, `docker_container_remove`, `docker_images_list`, `docker_image_inspect`, `docker_image_remove`, `docker_system_info`, `docker_system_df` | No | Unix socket connection, container & image management |

## Quick Start

### Stdio Transport (Recommended for Claude Code)

The Claude Code CLI has known issues with HTTP/SSE transport where headers are stripped. Use stdio transport instead:

```bash
# 1. Install all dependencies
npm install

# 2. Build all servers
npm run build

# 3. Add servers to Claude Code
claude mcp add duckduckgo-search --transport stdio --scope user --env TRANSPORT=stdio -- \
  node /Users/jignesh/Learning/projects/mcp-servers/servers/duckduckgo-search/dist/index.js

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

# 2. Copy environment template
cp .env.example .env.local

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
cp -r servers/duckduckgo-search servers/my-new-server

# Update package.json name and config
# Update scripts/start-all.js to register it
# Add Dockerfile in docker/my-new-server/
```

## Docker Deployment

```bash
# Start all servers via Docker Compose
docker compose --env-file .env.local up --build

# Start a single server
docker compose --env-file .env.local up duckduckgo-search
```

## Project Structure

```
.
├── servers/              # Individual MCP servers
│   ├── duckduckgo-search/
│   ├── browser/
│   ├── filesystem/
│   ├── fetch/
│   ├── memory/
│   └── docker/
├── docker/               # Dockerfiles for each server
├── scripts/              # Development utilities
│   ├── start-all.js      # Start all servers (HTTP mode)
│   └── stop-all.js       # Stop all servers
├── docker-compose.yml      # Multi-server orchestration
└── docs/
    └── adding-new-server.md    # Guide for adding servers
```

## License

MIT