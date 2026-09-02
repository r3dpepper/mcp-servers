# Adding an External MCP Server

This is the guideline for hosting a **published, third-party MCP server**
(an npm package or binary we run as-is) inside our hub. It differs from
[adding-new-server.md](./adding-new-server.md), which covers servers we
write ourselves under `servers/`.

**Current external servers:**

| Server | Package | Pinned version | Port |
|--------|---------|----------------|------|
| `playwright` | `@playwright/mcp` | `0.0.79` | 3008 |

---

## When to add an external server vs. writing one

Prefer an **external package** when:

- A well-maintained implementation already exists (active upstream, healthy releases)
- The capability is broad and fast-moving (e.g. browser automation) — you want
  upstream's engineering, not a fork to maintain
- You don't need custom behavior baked into the code itself (our domain
  allowlists, caching policies, truncation, etc.)

Write it **ourselves** when:

- We need hub-wide conventions enforced in code: zod validation depth,
  rate limits, caches, output truncation, domain allowlists
  (`browser`, `docker`, `fetch`)
- No credible maintained package exists
- The surface is small enough that owning it is cheaper than tracking upstream

The trade-off in one line: **external = zero code ownership but version-gated
control; self-written = full control but full maintenance.**

---

## Integration checklist (one-time)

1. **Pick the next free port** in the 3002+ range.
2. **Pin an exact released version** — never `@latest`, never `-alpha`.
   ```bash
   npm view <package> dist-tags          # 'latest' = stable channel; 'next' = dev
   npm view <package> time['<version>']  # sanity-check how fresh it is
   ```
3. **Add to `SERVERS`** in `scripts/manage-mcp-servers.sh` (`"name:port"`).
4. **Add a start command** in `start_command_for()` in the same script — this is
   where the pin lives, making it *the single place to bump*. Use
   `npx --yes <pkg>@<exact-version>` so detached background starts never prompt:
   ```bash
   playwright)
       echo "cd '${PROJECT_ROOT}' && npx --yes @playwright/mcp@0.0.79 --port 3008 --headless"
       ;;
   ```
5. **Add the name to `is_external_server()`** in the same script — this makes
   stdio registration skip it and relaxes the `servers/<name>/` directory check.
6. **Install any runtime prerequisites** the package needs (first setup only;
   e.g. `npx playwright install chromium`). Cached browsers live in
   `~/Library/Caches/ms-playwright`.
7. **Start and verify:**
   ```bash
   ./scripts/manage-mcp-servers.sh start <name>
   curl -X POST http://localhost:<port>/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}'
   ```
8. **Register with Claude Code:**
   ```bash
   claude mcp add <name>-http --transport http --scope user http://localhost:<port>/mcp
   ```
9. **Update docs**: the server tables in `CLAUDE.md` and `README.md`, and the
   table at the top of this file.

---

## How status works for external servers

Nothing special is required — by design:

- `status` checks the port via curl's **network exit code**, not the HTTP
  status, so servers without a `/health` endpoint still report correctly.
- `stop` / `restart` kill whatever **listens on the port** plus its process
  tree (`node`/`sh` ancestors first so watchers cannot respawn children) —
  transport-agnostic, works identically on `npx` processes.
- `status` shows the listening **PID**, so you can always see which process
  backs each server.

External servers are **HTTP-only** here: `add-stdio` skips them because there
is no local build to point stdio at. Note also that some strict servers
(like playwright-mcp) require the full MCP initialize handshake before
answering `tools/list` — our own SDK-based servers happen to be lenient, so a
bare probe returning "Server not initialized" means the port is alive.

---

## Upstream update ritual

Nothing updates automatically — run this check whenever *you* choose:

```bash
npm view @playwright/mcp dist-tags      # compare 'latest' against our pin
```

If `latest` is newer than our pin:

1. **Read the changelog** (GitHub releases) between our pin and the new
   version — look for renamed/removed tools or changed CLI flags. Bug fixes
   cost us nothing; interface changes are what matter.
2. **Bump the one string** in `start_command_for()` in
   `scripts/manage-mcp-servers.sh`.
3. `./scripts/manage-mcp-servers.sh restart <name>` — npx fetches the new
   version at launch; nothing else to install.
4. **Verify**: `claude mcp list` shows connected; spot-check a tool call.
5. **Rollback if needed**: restore the old string and restart again — npx keeps
   previously fetched versions cached, so rollback is instant.

Why pin instead of `@latest`: `@latest` silently changes your tool surface
when upstream publishes (new or renamed tools appear mid-work). The pin means
*you* decide when that happens, as a deliberate, revertible edit.
