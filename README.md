# MCP Hub

A multi-server MCP (Model Context Protocol) hub that exposes various tools to AI assistants. Each server is independently deployable and can be enabled/disabled as needed.

## Available Servers

| Server | Port | Tools | API Key Required |
|--------|------|-------|------------------|
| `duckduckgo-search` | 3002 | `duckduckgo_search`, `duckduckgo_instant_answer` | No |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No |
| `filesystem` | 3004 | `read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `directory_tree`, `move_file`, `search_files`, `get_file_info`, `list_allowed_directories` | No |

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