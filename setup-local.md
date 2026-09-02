# Local Setup Guide — Fresh Machine

Runbook for setting up the MCP Hub from zero on a macOS/Linux machine.
The hub hosts **7 MCP servers** — six written in this repo plus one external
npm package (`playwright`) — all managed through a single script.

| Server | Port | What it needs |
|--------|------|---------------|
| `ddg-search` | 3002 | nothing (no API key) |
| `browser` | 3003 | nothing |
| `filesystem` | 3004 | nothing |
| `fetch` | 3005 | nothing |
| `memory` | 3006 | nothing (persists to disk, see below) |
| `docker` | 3007 | **Docker Desktop running** (Unix socket) |
| `playwright` *(external)* | 3008 | **Playwright browser binaries** (~2 GB cache) |

---

## Prerequisites

- **Node.js ≥ 18** and npm
- **Docker Desktop** — only if you want the docker server; start it before
  starting the hub
- **git**

```bash
node --version   # v18 or higher
```

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url> mcp-servers
cd mcp-servers
npm install       # installs all workspace dependencies
npm run build     # compiles every server to servers/<name>/dist/
```

### 2. Configure environment

```bash
cp .env.example .env
```

> ⚠️ **The file must be named `.env`** for local runs. Every server loads its
> config with `dotenv/config`, which reads `.env` only — a `.env.local` copy is
> silently ignored in local mode. (`docker compose` is the exception: it gets
> `--env-file .env.local` passed explicitly, so either name works there.)

Defaults work out of the box; edit ports or limits in `.env` if needed.

### 3. Install Playwright browser binaries (one-time)

```bash
npx playwright install chromium
```

Downloads chromium into `~/Library/Caches/ms-playwright/`. Skip only if that
directory already has browsers on this machine.

### 4. Start the hub

```bash
./scripts/manage-mcp-servers.sh start
```

Starts every server that isn't already running, detached in the background,
and waits until each answers on its port. First launch of `playwright`
additionally fetches the pinned package into the npx cache.

Foreground alternative (logs in your terminal, Ctrl-C stops all):
```bash
npm run dev
```

### 5. Register with Claude Code

```bash
./scripts/manage-mcp-servers.sh add-http      # all 7 as *-http entries
# or: ./scripts/manage-mcp-servers.sh add-all  # also stdio variants (build required)
```

### 6. Verify

```bash
./scripts/manage-mcp-servers.sh status        # port + PID + health table
claude mcp list                               # ✔ Connected per entry
```

Expected: 7/7 running, every registration connected. If something failed,
the log for each server lives at `$TMPDIR/mcp-<name>.log`.

---

## Day-to-day

```bash
./scripts/manage-mcp-servers.sh status              # table incl. listening PID
./scripts/manage-mcp-servers.sh restart memory      # bounce one server
./scripts/manage-mcp-servers.sh stop                # stop what's running
./scripts/manage-mcp-servers.sh start               # start what's down
claude mcp remove <name>-http --scope user          # unregister one server
```

---

## Where things live on this machine

| Thing | Location |
|-------|----------|
| Built server code | `<repo>/servers/<name>/dist/` |
| Hub environment config | `<repo>/.env` |
| Memory server database (persists across restarts) | `~/.mcp-servers/memory.db` |
| Per-server logs | `$TMPDIR/mcp-<name>.log` |
| Pinned external packages (e.g. `@playwright/mcp@0.0.79`) | `~/.npm/_npx/<hash>/` |
| Playwright browser binaries | `~/Library/Caches/ms-playwright/` |
| Claude Code registrations | `~/.claude.json` |

Nothing outside `<repo>` and the paths above is created. Deleting
`~/.mcp-servers/` resets the memory graph; deleting an `_npx` hash dir just
forces a re-download on next start of that version.

---

## Troubleshooting

**Port already in use**
```bash
lsof -ti tcp:3002 | xargs kill          # free one port
./scripts/manage-mcp-servers.sh status  # then re-check
```

**`docker` tools fail with connection errors** — Docker Desktop isn't running,
or the socket moved. Start Docker, or set `DOCKER_SOCKET_PATH` in `.env`.

**`playwright` starts but browser calls fail** — browser binaries missing:
`npx playwright install chromium`.

**Claude Code can't connect over HTTP** — some runtimes strip required Accept
headers. Either retry after a full Claude Code restart, or switch that server
to stdio: `./scripts/manage-mcp-servers.sh add-all` registers both variants;
stdio needs `npm run build` first.

**Env changes seem ignored** — wrong filename. Local mode reads `.env`;
`.env.local` only affects `docker compose` invocations.
