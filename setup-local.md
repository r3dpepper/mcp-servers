# Local Setup Guide

## Overview

This is a **multi-server MCP Hub** — each server lives in `servers/<name>/` and can be run independently or together.

---

## Prerequisites

### Node.js (v18+)

```bash
node --version   # Should show v18.x or higher
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

DuckDuckGo needs no API key — it works immediately.

### 3. Start servers

**Start all enabled servers:**
```bash
npm run dev
```

**Start a single server (recommended for testing):**
```bash
cd servers/duckduckgo-search
npm run dev
```

**Build and run:**
```bash
npm run build
node dist/index.js
```

**Server running at:** `http://localhost:3002/mcp`

---

## Verify

```bash
# Health check
curl http://localhost:3002/health

# Test search
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"duckduckgo_search","arguments":{"query":"TypeScript MCP"}}}'
```

---

## Connect to Claude Code

```bash
claude mcp add duckduckgo-search --transport http --scope user http://localhost:3002/mcp
claude mcp list   # verify connection
```

---

## Project Structure

```
.
├── servers/
│   └── duckduckgo-search/    ← Individual server
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── docker/                    ← Dockerfiles per server
├── scripts/
│   └── start-all.js           ← Starts all servers
├── docker-compose.yml         ← Docker orchestration
└── .env.example               ← Environment template
```

---

## Troubleshooting

### "Port 3002 already in use"

```bash
# Find and kill the process
lsof -ti:3002 | xargs kill

# Or change the port in .env.local
DUCKDUCKGO_SEARCH_PORT=3003
```

### Search returns no results

DuckDuckGo's HTML endpoint occasionally rate-limits. Wait 30 seconds and retry.

### Server won't connect

1. Check health: `curl http://localhost:3002/health`
2. Check server logs in terminal
3. Restart the server
4. Restart Claude Code completely