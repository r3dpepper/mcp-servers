# .claude Workflow Harness Reference

## Overview

This document captures research on Claude Code's workflow harness components: skills, agents (subagents), hooks, and commands.

---

## 1. Skills (`~/.claude/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`)

### Directory Structure

```
.claude/
└── skills/
    └── <skill-name>/
        ├── SKILL.md          # Main instructions (required)
        ├── template.md       # Optional: Templates for Claude to fill
        ├── examples/         # Optional: Example outputs
        └── scripts/          # Optional: Helper scripts
```

### Frontmatter Fields

```yaml
---
name: skill-name                # Optional: uses directory name if omitted
description: What the skill does and when to use it  # Recommended
disable-model-invocation: true  # Optional: only user-invocable (user types /name)
allowed-tools: Read, Bash       # Optional: pre-approved tools
user-invocable: true            # Optional: hide from / menu
argument-hint: [args]           # Optional: hints for autocomplete
context: fork                   # Optional: run in forked subagent
agent: Explore                  # Optional: which agent type (with context: fork)
model: sonnet                   # Optional: override model
effort: high                    # Optional: override effort level
hooks: {...}                    # Optional: scoped lifecycle hooks
paths: ["src/**/*.ts"]          # Optional: only load for matching files
---
```

### Scoping

| Location | Scope | Priority |
|----------|-------|----------|
| Managed settings | Organization-wide | 1 (highest) |
| `.claude/skills/` | Current project | 3 |
| `~/.claude/skills/` | All your projects | 4 |

---

## 2. Agents/Subagents (`~/.claude/agents/<name>.md` or `.claude/agents/<name>.md`)

### Directory Structure

```
.claude/
└── agents/
    └── <agent-name>.md   # Markdown file with frontmatter
```

### Frontmatter Fields

```yaml
---
name: code-reviewer        # Required - unique identifier
description: Reviews code for quality  # Required - when to delegate
tools: Read, Grep, Glob    # Optional: allowlist (none = inherit all)
disallowedTools: Write, Edit  # Optional: denylist
model: sonnet              # Optional: sonnet|opus|haiku|inherit (default)
permissionMode: default    # Optional: default|acceptEdits|auto|bypassPermissions|plan
maxTurns: 10               # Optional: limit agentic turns
skills: [api-conventions]  # Optional: preload skills at startup
hooks: {...}               # Optional: scoped lifecycle hooks
memory: user               # Optional: user|project|local
background: false          # Optional: run as background task
effort: medium             # Optional: low|medium|high|xhigh|max
isolation: worktree        # Optional: isolated git worktree
color: blue                # Optional: red|blue|green|yellow|purple|orange|pink|cyan
---
```

### Built-in Subagents

| Agent | Model | Purpose |
|-------|-------|---------|
| **Explore** | Haiku | Fast, read-only codebase research |
| **Plan** | inherit | Research for plan mode |
| **general-purpose** | inherit | Complex multi-step tasks |
| **statusline-setup** | Sonnet | Configure status line |
| **claude-code-guide** | Haiku | Questions about Claude Code |

---

## 3. Hooks (in `.claude/settings.json`)

### Event Types

| Event | Matcher Input | When Fires |
|-------|---------------|------------|
| `PreToolUse` | Tool name (e.g., "Bash", "Write") | Before tool executes |
| `PostToolUse` | Tool name | After tool completes |
| `Stop` | (none) | When main session ends |
| `SubagentStart` | Agent type name | When subagent begins |
| `SubagentStop` | Agent type name | When subagent completes |

### Settings Structure

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "./scripts/validate.sh" }]
      }
    ]
  }
}
```

### Exit Codes

| Code | Behavior |
|------|----------|
| `0` | Success, continue |
| `1` | Non-blocking error (logged) |
| `2` | Blocking error (stops operation) |

---

## 4. String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed |
| `$ARGUMENTS[N]` / `$N` | Nth argument (0-indexed) |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_EFFORT}` | Current effort level |
| `${CLAUDE_SKILL_DIR}` | Skill directory path |
| `! command` | Dynamic context injection |

---

## 5. Key Conventions

1. **Skills** - Prompt-based reusable instructions, loaded on demand
2. **Agents** - Specialized AI with isolated context, specific tools/permissions
3. **Hooks** - Deterministic shell commands at lifecycle events
4. Directory names determine command names (e.g., `skill-name` → `/skill-name`)

---

## 6. MCP Servers Project - Created Components

### Skills (4 created)

| Skill | File | Purpose |
|-------|------|---------|
| `/start-server` | `.claude/skills/start-server/SKILL.md` | Start a specific MCP server with health checks |
| `/test-search` | `.claude/skills/test-search/SKILL.md` | Test search functionality with sample queries |
| `/build-all` | `.claude/skills/build-all/SKILL.md` | Build all servers in the workspace |
| `/add-mcp-server` | `.claude/skills/add-mcp-server/SKILL.md` | Scaffold a new MCP server following project patterns |

### Agents (1 created)

| Agent | File | Purpose |
|-------|------|---------|
| `server-debugger` | `.claude/agents/server-debugger.md` | Debug MCP server connection/response issues (read-only tools) |

### Hooks (1 created)

| Hook | Script | Purpose |
|------|--------|---------|
| `PreToolUse: Bash` | `.claude/scripts/validate-docker.sh` | Block destructive Docker commands |

### Files Created

| File | Purpose |
|------|--------|
| `.claude/settings.json` | Project configuration (hooks + permissions) |