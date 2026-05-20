# Connecting MCP Hub to AI Tools

This guide covers how to connect every MCP Hub server to every major
AI tool that supports MCP. Follow only the section(s) for the tools
you use.

---

## Quick reference

| Tool | Config method | Config file location |
|------|--------------|----------------------|
| [Claude Desktop](#1-claude-desktop) | JSON config file | `~/Library/Application Support/Claude/` (macOS) |
| [Claude Code](#2-claude-code) | `claude mcp` CLI | per-project `.mcp.json` or global `~/.claude.json` |
| [Cursor](#3-cursor) | JSON config file | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) |
| [Windsurf](#4-windsurf) | JSON config file | `~/.codeium/windsurf/mcp_config.json` |
| [Zed](#5-zed) | `settings.json` | `~/.config/zed/settings.json` |
| [Continue](#6-continue) | `config.json` | `~/.continue/config.json` |
| [Cline / Roo Code](#7-cline--roo-code) | VS Code settings | VS Code `settings.json` |
| [Custom / API](#8-custom-integration-via-api) | HTTP directly | — |

**Before connecting any tool:** make sure the servers are running:
```bash
node scripts/start-all.js
```

Verify with:
```bash
curl http://localhost:3002/health   # DuckDuckGo (no API key)
curl http://localhost:3001/health   # Google Search (needs API key)
```

---

## 1. Claude Desktop

Claude Desktop reads a single JSON config file. You edit it manually,
then restart the app.

### Find your config file

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

> If the file doesn't exist yet, create it — including any missing parent folders.

### HTTP transport (servers already running)

Use this when you start servers yourself via `node scripts/start-all.js`
or Docker Compose:

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "url": "http://localhost:3002/mcp"
    },
    "google-search": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### STDIO transport (Claude Desktop manages the process)

Claude Desktop will start and stop the Node.js process automatically.
The server does **not** need to be running beforehand.

> ⚠️ Replace `/absolute/path/to/mcp-hub` with your actual path. Use
> `pwd` in the `mcp-hub` folder to get it.

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
        "--stdio"
      ],
      "env": {
        "DUCKDUCKGO_SEARCH_PORT": "3002",
        "LOG_LEVEL": "info"
      }
    },
    "google-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/google-search/dist/index.js",
        "--stdio"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_google_api_key_here",
        "GOOGLE_CSE_ID": "your_cse_id_here",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

> **Build first** for STDIO mode:
> ```bash
> cd servers/duckduckgo-search && npm run build
> cd servers/google-search && npm run build
> ```

### Verify it's working

1. Fully quit Claude Desktop (Cmd+Q on macOS, not just close window)
2. Reopen Claude Desktop
3. Start a new conversation
4. Look for the 🔌 tools icon in the input bar
5. Test it: *"Search DuckDuckGo for the latest TypeScript release"*

### Troubleshooting Claude Desktop

| Symptom | Fix |
|---------|-----|
| No tools icon visible | Fully quit and reopen; check JSON is valid |
| "Server disconnected" | Check the server is running; check the port |
| Tools visible but calls fail | Check API keys in env; check server logs |
| JSON parse error on startup | Validate at [jsonlint.com](https://jsonlint.com) |

---

## 2. Claude Code

Claude Code is the terminal-based coding agent. It has a dedicated
`claude mcp` command for managing servers.

### Add servers (HTTP transport — recommended)

```bash
# Add DuckDuckGo (works immediately, no API key)
claude mcp add duckduckgo-search --transport http http://localhost:3002/mcp

# Add Google Search
claude mcp add google-search --transport http http://localhost:3001/mcp
```

### Add servers (STDIO transport)

```bash
# DuckDuckGo via STDIO
claude mcp add duckduckgo-search \
  --transport stdio \
  -- node /absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js --stdio

# Google Search via STDIO (pass env vars with -e)
claude mcp add google-search \
  --transport stdio \
  -e GOOGLE_API_KEY=your_key_here \
  -e GOOGLE_CSE_ID=your_cse_id_here \
  -- node /absolute/path/to/mcp-hub/servers/google-search/dist/index.js --stdio
```

### Scope: project vs global

By default `claude mcp add` saves to the **current project** (`.mcp.json`
in the working directory). To add globally across all projects:

```bash
claude mcp add duckduckgo-search \
  --transport http \
  --scope global \
  http://localhost:3002/mcp
```

### Manage servers

```bash
# List all configured servers and their status
claude mcp list

# Show details for one server
claude mcp get duckduckgo-search

# Remove a server
claude mcp remove duckduckgo-search

# Remove globally
claude mcp remove duckduckgo-search --scope global
```

### The .mcp.json file (project-level)

When you add a server with `claude mcp add`, Claude Code writes a
`.mcp.json` file in your project root. You can also edit it directly
and commit it to share with your team:

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "type": "http",
      "url": "http://localhost:3002/mcp"
    },
    "google-search": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

> **Tip:** Commit `.mcp.json` so every team member automatically gets
> the servers configured when they open the project.

### The global config (~/.claude.json)

Global servers are stored in `~/.claude.json`. You can view it with:

```bash
cat ~/.claude.json | python3 -m json.tool
```

### Verify inside Claude Code

After adding, test in a Claude Code session:

```
> Search for "MCP protocol specification" using DuckDuckGo
```

Or check available tools:

```bash
claude mcp list
```

### Troubleshooting Claude Code

```bash
# Test the server is reachable before adding it
curl -s http://localhost:3002/health

# Re-add if the URL changed
claude mcp remove duckduckgo-search
claude mcp add duckduckgo-search --transport http http://localhost:3002/mcp

# View Claude Code logs (macOS)
tail -f ~/Library/Logs/Claude\ Code/*.log
```

---

## 3. Cursor

Cursor supports MCP via a JSON config file. You can configure it globally
(all projects) or per-project.

### Global config — all projects

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "url": "http://localhost:3002/mcp"
    },
    "google-search": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Project config — one project only

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

> Project config takes precedence over global config.

### STDIO config in Cursor

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
        "--stdio"
      ]
    },
    "google-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/google-search/dist/index.js",
        "--stdio"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_key_here",
        "GOOGLE_CSE_ID": "your_cse_id_here"
      }
    }
  }
}
```

### Enable in Cursor settings

1. Open Cursor → **Settings** (Cmd+, / Ctrl+,)
2. Search for **"MCP"**
3. Ensure **"Enable MCP"** is toggled on

### Verify in Cursor

1. Open the AI chat panel (Cmd+L / Ctrl+L)
2. Look for the tools/MCP indicator
3. Ask: *"Use DuckDuckGo to find the latest news about AI coding assistants"*

### Troubleshooting Cursor

| Symptom | Fix |
|---------|-----|
| Tools not appearing | Restart Cursor; check JSON syntax |
| "Failed to connect" | Verify `curl http://localhost:3002/health` works |
| Works globally but not per-project | Check `.cursor/mcp.json` path is at project root |

---

## 4. Windsurf

Windsurf (by Codeium) supports MCP via a global config file.

### Config file location

| OS | Path |
|----|------|
| macOS | `~/.codeium/windsurf/mcp_config.json` |
| Windows | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| Linux | `~/.codeium/windsurf/mcp_config.json` |

### Config format

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "serverUrl": "http://localhost:3002/mcp"
    },
    "google-search": {
      "serverUrl": "http://localhost:3001/mcp"
    }
  }
}
```

> Windsurf uses `serverUrl` (not `url`) — note the difference.

### STDIO in Windsurf

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
        "--stdio"
      ],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Verify in Windsurf

1. Restart Windsurf after editing the config
2. Open the Cascade panel
3. Look for the MCP tools icon
4. Test: *"Search the web for TypeScript 5.5 release notes"*

---

## 5. Zed

Zed is a fast native code editor with built-in MCP support via its
`settings.json`.

### Config file location

| OS | Path |
|----|------|
| macOS | `~/.config/zed/settings.json` |
| Linux | `~/.config/zed/settings.json` |
| Windows | `%APPDATA%\Zed\settings.json` |

Open it with: **Zed → Settings → Open Settings** (Cmd+, / Ctrl+,)

### HTTP config

Add an `"context_servers"` section to your existing `settings.json`:

```json
{
  "context_servers": {
    "duckduckgo-search": {
      "source": "custom",
      "configuration": {
        "type": "url",
        "url": "http://localhost:3002/mcp"
      }
    },
    "google-search": {
      "source": "custom",
      "configuration": {
        "type": "url",
        "url": "http://localhost:3001/mcp"
      }
    }
  }
}
```

### STDIO config in Zed

```json
{
  "context_servers": {
    "duckduckgo-search": {
      "source": "custom",
      "configuration": {
        "type": "stdio",
        "command": {
          "path": "node",
          "args": [
            "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
            "--stdio"
          ],
          "env": {
            "LOG_LEVEL": "info"
          }
        }
      }
    }
  }
}
```

### Verify in Zed

1. Save `settings.json` — Zed reloads live
2. Open the Assistant panel
3. The MCP tools should appear in the context

---

## 6. Continue

Continue is an open-source AI coding assistant that works as a VS Code
or JetBrains extension.

### Config file location

| OS | Path |
|----|------|
| macOS / Linux | `~/.continue/config.json` |
| Windows | `%USERPROFILE%\.continue\config.json` |

Or open it from VS Code: **Continue sidebar → Settings icon → Open config.json**

### Add MCP servers to config.json

Add an `"mcpServers"` array to your existing config:

```json
{
  "models": [ ... ],
  "mcpServers": [
    {
      "name": "duckduckgo-search",
      "transport": {
        "type": "http",
        "url": "http://localhost:3002/mcp"
      }
    },
    {
      "name": "google-search",
      "transport": {
        "type": "http",
        "url": "http://localhost:3001/mcp"
      }
    }
  ]
}
```

### STDIO config in Continue

```json
{
  "mcpServers": [
    {
      "name": "duckduckgo-search",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": [
          "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
          "--stdio"
        ],
        "env": {
          "LOG_LEVEL": "info"
        }
      }
    }
  ]
}
```

### Verify in Continue

1. Save `config.json` — Continue reloads automatically
2. Open Continue sidebar in VS Code
3. In the chat, type `@` to see available context providers including your MCP tools
4. Test: *"@duckduckgo-search find recent articles about MCP servers"*

---

## 7. Cline / Roo Code

Cline (and its fork Roo Code) are VS Code extensions. They store MCP
config in VS Code settings.

### Via VS Code settings UI

1. Open VS Code → **Settings** (Cmd+, / Ctrl+,)
2. Search for **"Cline MCP"** or **"Roo MCP"**
3. Click **"Edit in settings.json"**

### Via settings.json directly

Open `settings.json` (Cmd+Shift+P → "Open User Settings (JSON)") and add:

**For Cline:**
```json
{
  "cline.mcpServers": {
    "duckduckgo-search": {
      "url": "http://localhost:3002/mcp",
      "disabled": false
    },
    "google-search": {
      "url": "http://localhost:3001/mcp",
      "disabled": false
    }
  }
}
```

**For Roo Code:**
```json
{
  "roo-cline.mcpServers": {
    "duckduckgo-search": {
      "url": "http://localhost:3002/mcp",
      "disabled": false
    },
    "google-search": {
      "url": "http://localhost:3001/mcp",
      "disabled": false
    }
  }
}
```

### STDIO in Cline

```json
{
  "cline.mcpServers": {
    "duckduckgo-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/duckduckgo-search/dist/index.js",
        "--stdio"
      ],
      "disabled": false
    }
  }
}
```

### Verify in Cline / Roo Code

1. Open the Cline / Roo Code panel in VS Code
2. Click the **MCP** icon to see connected servers
3. A green dot means connected and ready
4. Test in a task: *"Search DuckDuckGo for best practices for TypeScript monorepos"*

---

## 8. Custom integration via API

If you're building your own agent, calling the MCP server directly is
straightforward. The servers speak [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
over HTTP.

### List available tools

```bash
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | python3 -m json.tool
```

### Call a tool

```bash
# DuckDuckGo web search
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "duckduckgo_search",
      "arguments": {
        "query": "Model Context Protocol specification",
        "num_results": 5
      }
    }
  }' | python3 -m json.tool

# DuckDuckGo instant answer
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "duckduckgo_instant_answer",
      "arguments": { "query": "speed of light" }
    }
  }' | python3 -m json.tool

# Google web search
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "google_search",
      "arguments": {
        "query": "TypeScript 5.5 new features",
        "num_results": 5,
        "date_restrict": "m3"
      }
    }
  }' | python3 -m json.tool
```

### Python example

```python
import requests

def call_mcp_tool(server_url: str, tool_name: str, arguments: dict):
    response = requests.post(
        f"{server_url}/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
        },
    )
    response.raise_for_status()
    result = response.json()
    return result["result"]["content"][0]["text"]


# DuckDuckGo — no API key needed
text = call_mcp_tool(
    "http://localhost:3002",
    "duckduckgo_search",
    {"query": "Python asyncio tutorial", "num_results": 5},
)
print(text)
```

### Node.js / TypeScript example

```typescript
async function callMcpTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${serverUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const data = await res.json();
  return data.result.content[0].text;
}

// Usage
const result = await callMcpTool(
  "http://localhost:3002",
  "duckduckgo_instant_answer",
  { query: "32 celsius in fahrenheit" }
);
console.log(result);
```

---

## Using servers hosted on AWS

Once deployed to AWS, replace `localhost` with your public IP or ALB hostname:

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "url": "http://YOUR_AWS_IP:3002/mcp"
    },
    "google-search": {
      "url": "http://YOUR_AWS_IP:3001/mcp"
    }
  }
}
```

With HTTPS + a custom domain:
```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "url": "https://mcp.yourdomain.com/duckduckgo/mcp"
    }
  }
}
```

See [setup-aws.md](setup-aws.md) for how to set up the load balancer and domain.

---

## HTTP vs STDIO — which should I use?

| | HTTP transport | STDIO transport |
|--|---------------|-----------------|
| **How it works** | Server runs as a separate process; client connects over HTTP | Client spawns the server process directly |
| **You start the server** | Yes — `node scripts/start-all.js` | No — the tool manages it |
| **Multiple tools share one server** | ✅ Yes | ❌ No — each tool gets its own process |
| **Works on remote/AWS** | ✅ Yes | ❌ No — must be local |
| **Logs easy to see** | ✅ Yes — in your terminal | Harder — buried in tool logs |
| **Best for** | Development, shared team servers, AWS | Single-user local setups |

**Recommendation:** Use **HTTP** during development (easier to debug) and on AWS. Use **STDIO** only if a specific tool requires it or you want zero-dependency startup.

---

## All servers at a glance

| Server | HTTP URL | Tools |
|--------|----------|-------|
| DuckDuckGo Search | `http://localhost:3002/mcp` | `duckduckgo_search`, `duckduckgo_instant_answer` |
| Google Search | `http://localhost:3001/mcp` | `google_search`, `google_image_search`, `google_news_search` |

---

## Sharing server config with your team

If multiple people on a team use the same MCP Hub servers, the easiest
approach is to commit a `.mcp.json` at the project root. Claude Code reads
it automatically; other tools can use it as a reference.

```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "type": "http",
      "url": "http://localhost:3002/mcp"
    },
    "google-search": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

**To generate this file via Claude Code and commit it:**

```bash
# Add both servers to the current project scope
claude mcp add duckduckgo-search --transport http http://localhost:3002/mcp
claude mcp add google-search --transport http http://localhost:3001/mcp

# .mcp.json is now written — commit it
git add .mcp.json
git commit -m "chore: add MCP Hub server config for Claude Code"
```

Teammates clone the repo, run `npm install && node scripts/start-all.js`,
and Claude Code picks up the servers automatically — no manual config needed.

---

## Common errors and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` on port 3001/3002 | Server not running | Run `node scripts/start-all.js` |
| Tool shows connected but calls return errors | Missing API key | Check `.env.local` has real values, not placeholders |
| Claude Desktop shows no tools icon | Config JSON invalid | Validate at [jsonlint.com](https://jsonlint.com) |
| `claude mcp add` succeeds but tools not visible | Project vs global scope mismatch | Try `--scope global` or check you're in the right dir |
| Cursor tools not appearing | MCP not enabled in settings | Settings → search "MCP" → enable the toggle |
| Windsurf can't connect | Using `url` instead of `serverUrl` | Windsurf requires the key `serverUrl`, not `url` |
| Zed shows error in logs | `url` format wrong | Zed uses `"type": "url"` inside `configuration` |
| Continue tools not shown | Missing `mcpServers` array | Must be a top-level array, not nested under `models` |
| STDIO mode: server not found | Wrong absolute path | Run `pwd` in `mcp-hub` dir to get the correct prefix |
| STDIO mode: env vars not passed | Not using `-e` flag (Claude Code) | Use `claude mcp add ... -e KEY=value ...` |
| Google search fails with 429 | Daily quota exhausted (100/day free) | Switch to `duckduckgo-search` in tool config |
| DuckDuckGo returns empty results | Temporary rate-limit | Wait 30s and retry; check `DUCKDUCKGO_TIMEOUT_MS` |

---

## Verifying a connection from the terminal

Before debugging tool-side config, always confirm the server itself is healthy:

```bash
# 1. Health check
curl http://localhost:3002/health
# Expected: {"status":"ok","server":"duckduckgo-search",...}

# 2. List tools (MCP tools/list)
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -m json.tool

# 3. Actually call a tool end-to-end
curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "duckduckgo_search",
      "arguments": { "query": "hello world", "num_results": 2 }
    }
  }' | python3 -m json.tool
```

If steps 1–3 all succeed but the tool still shows errors, the problem is
in the tool's config (wrong URL, wrong key name, JSON syntax error).
If step 1 fails, the server isn't running or the port is wrong.
