# CLAUDE.md — MCP Hub

> This file is read automatically by **Claude Code**. It tells Claude how this
> project is structured, what commands to use, and how to make changes safely.

---

## Project overview

This is a **multi-server MCP Hub** that hosts independently deployable MCP servers. Each server lives in `servers/<name>/` and can be enabled/disabled individually.

**Running servers:**

| Server | Port | Tools | API Key |
|--------|------|-------|---------|
| `duckduckgo-search` | 3002 | `duckduckgo_search`, `duckduckgo_instant_answer` | No |
| `browser` | 3003 | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_extract` | No |
| `filesystem` | 3004 | `filesystem_list_allowed` (wrapper) | No |
| `fetch` | 3005 | `fetch_url` | No |
| `memory` | 3006 | `memory_write`, `memory_read`, `memory_manage` | No |

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
│   └── duckduckgo-search/
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
│   └── start-all.js                  ← Local dev: starts all servers
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

# Start all enabled servers
npm run dev

# Stop all running servers
npm run stop

# Stop a specific server
npm run stop-browser      # Stop only the browser server
npm run stop-filesystem   # Stop only the filesystem server
npm run stop-fetch        # Stop only the fetch server

# Build all servers
npm run build

# Start a single server (for testing)
cd servers/duckduckgo-search && npm run dev
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DUCKDUCKGO_SEARCH_PORT` | 3002 | DuckDuckGo server port |
| `DUCKDUCKGO_SEARCH_MAX_RESULTS` | 10 | Max results per search (max: 50) |
| `DUCKDUCKGO_TIMEOUT_MS` | 10000 | Request timeout in milliseconds |
| `DUCKDUCKGO_RATE_LIMIT_PER_MINUTE` | 10 | Rate limit for search requests |
| `DUCKDUCKGO_CACHE_TTL_SECONDS` | 300 | Search result cache TTL (5 minutes) |
| `TRANSPORT` | http | `http` or `stdio` |
| `NODE_ENV` | development | Environment |
| `LOG_LEVEL` | info | Logging level |
| `FETCH_PORT` | 3005 | Fetch server port |
| `FETCH_TIMEOUT_MS` | 30000 | Fetch request timeout |
| `FETCH_MAX_URL_LENGTH` | 2048 | Maximum URL length allowed |
| `FETCH_MAX_CONTENT_LENGTH` | 1048576 | Maximum response size (1MB) |
| `FETCH_USER_AGENT` | MCP-Fetch-Server/1.0 | User agent header |

---

## Code conventions

- All source files use **ESM** (`import`/`export`), not `require`
- Import paths end with `.js` (TypeScript ESM resolution)
- Each tool is its own file in `src/tools/`, re-exported from `tools/index.ts`
- `config.ts` in each server is the only place env vars are read
- Use `logger` from `logger.ts`, never `console.log` directly
- Use `zod` for all input validation

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

## Testing a tool manually

```bash
# Health check
curl http://localhost:3002/health

# Test search
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"duckduckgo_search","arguments":{"query":"TypeScript MCP"}}}'
```

---

## Connecting to Claude Code

Register the MCP servers with Claude Code using the `claude mcp add` command:

```bash
# DuckDuckGo Search
claude mcp add duckduckgo-search --transport http --scope user http://localhost:3002/mcp

# Browser Automation
claude mcp add browser --transport http --scope user http://localhost:3003/mcp

# Filesystem
claude mcp add filesystem --transport http --scope user http://localhost:3004/mcp

# Fetch
claude mcp add fetch --transport http --scope user http://localhost:3005/mcp

# Memory
claude mcp add memory --transport http --scope user http://localhost:3006/mcp
```

---

## When updating docs

- Keep this `CLAUDE.md` in sync after every structural change
- `README.md` is the public-facing summary
- `docs/adding-new-server.md` contains the guide for adding new servers