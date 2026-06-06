# MCP Hub

A multi-server MCP (Model Context Protocol) hub that exposes various tools to AI assistants. Each server is independently deployable and can be enabled/disabled as needed.

## Available Servers

| Server | Port | Tools | API Key Required | Features |
|--------|------|-------|------------------|----------|
| `duckduckgo-search` | 3002 | `duckduckgo_search`, `duckduckgo_instant_answer` | No | Rate limiting, caching, retry logic |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No | - |
| `filesystem` | 3004 | `read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `directory_tree`, `move_file`, `search_files`, `get_file_info`, `list_allowed_directories` | No | CORS support |
| `fetch` | 3005 | `fetch_url` | No | Security hardening, timeout protection, retry logic |
| `memory` | 3006 | `memory_write`, `memory_read`, `memory_manage` | No | - |

## Quick Start

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

See [adding-new-server.md](./adding-new-server.md) for detailed instructions.

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
│   └── duckduckgo-search/
├── docker/               # Dockerfiles for each server
├── scripts/              # Development utilities
├── docker-compose.yml      # Multi-server orchestration
└── adding-new-server.md    # Guide for adding servers
```

## License

MIT