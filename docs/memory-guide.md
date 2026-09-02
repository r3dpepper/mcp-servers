# Memory Server — Usage Guide

This guide explains how to use the knowledge-graph memory server effectively,
including ready-to-use system prompts that teach Claude to persist and recall
context automatically across sessions.

---

## Why this exists

Claude has no memory between chat sessions by default. Every new conversation
starts blank. The memory server solves this by giving Claude a place to write
and read structured facts that survive across sessions.

**Without memory:**
```
Session 1: "I'm Alice, I work on ProjectX in TypeScript."
Session 2: "What project am I working on?" → Claude: "I don't know."
```

**With memory:**
```
Session 1: Claude calls memory_add_entities + memory_add_observations → stored.
Session 2: Claude calls memory_search("Alice") → recalls ProjectX, TypeScript.
```

---

## The graph model — quick reference

```
Entity ─── Observation
  │            └── a timestamped, atomic fact ("Uses TypeScript 5.4")
  │
  └──[RELATION_TYPE]──▶ Entity
         └── typed directed edge ("Alice WORKS_ON ProjectX")
```

### Entity naming conventions

| What | Convention | Examples |
|------|-----------|---------|
| People | `Firstname_Lastname` | `Alice_Smith`, `Bob` |
| Projects | `PascalCase` | `ProjectX`, `MCP_Hub` |
| Tools / tech | Canonical name | `TypeScript`, `PostgreSQL`, `Neovim` |
| Concepts | `snake_case` or words | `async_patterns`, `clean_architecture` |
| Decisions | `Decision_` prefix | `Decision_Use_Postgres`, `Decision_Monorepo` |
| Companies | Official name | `Anthropic`, `Acme_Corp` |

### Relation type conventions

Always **active voice**, **SCREAMING_SNAKE_CASE**:

| Type | Meaning |
|------|---------|
| `WORKS_ON` | Person works on project |
| `KNOWS` | Person knows person |
| `USES` | Project/person uses tool |
| `DEPENDS_ON` | Project depends on project |
| `IS_A` | Is a type of |
| `PART_OF` | Is part of a larger thing |
| `CREATED_BY` | Was created by |
| `SUPERSEDES` | Replaces an older thing |
| `CONFLICTS_WITH` | Is incompatible with |
| `OWNS` | Person/org owns project |
| `REPORTS_TO` | Person reports to person |
| `DECIDED_BY` | Decision was made by |

### Observation writing rules

Each observation should be:
- **Atomic** — one fact per observation
- **Self-contained** — no pronouns ("Alice prefers…" not "She prefers…")
- **Specific** — include context, versions, dates when relevant
- **Present tense** for ongoing facts, past tense for historical ones

Good:
```
"Alice prefers async communication over synchronous meetings"
"ProjectX uses PostgreSQL 16 as its primary database"
"Decision_Use_Postgres was made on 2024-11 to avoid ORM complexity"
```

Bad:
```
"She likes async"          ← pronoun
"Uses Postgres"            ← whose project? what version?
"Many things were decided" ← vague, not atomic
```

---

## System prompts

Copy one of these into your AI tool's system prompt field to teach Claude
to use memory automatically.

### Minimal (Claude Code / API)

```
You have access to a persistent knowledge-graph memory via MCP tools.

At the START of every session:
- Call memory_search with relevant keywords to recall context.
- Call memory_list_namespaces to see what's stored.

During a session, store NEW information by calling:
- memory_add_entities  — for new people, projects, tools, concepts
- memory_add_relations — for connections between entities
- memory_add_observations — for discrete facts about entities

Use namespace "default" unless the user specifies a project context.
Never wait to be asked — proactively save and recall relevant context.
```

### Standard (Claude Desktop)

```
You have access to a persistent knowledge-graph memory (SQLite, local).
Use it to remember context across sessions.

## On session start
1. Call memory_search with the user's name or current topic to load context.
2. If the user introduces themselves or mentions their work, store it immediately.

## During the session — save these automatically
- People mentioned (name, role, preferences, expertise)
- Projects discussed (name, tech stack, status, decisions)
- Preferences the user expresses (tools, approaches, communication style)
- Decisions made with their rationale
- Problems solved and how they were resolved
- Explicit "remember that…" requests

## Naming conventions
- Entity names: consistent PascalCase or Snake_Case (Alice_Smith, ProjectX)
- Relation types: SCREAMING_SNAKE_CASE active voice (WORKS_ON, DEPENDS_ON)
- Observations: atomic, self-contained sentences, no pronouns

## Namespaces
- Use "default" for personal/general context
- Use the project name for project-specific memories
- Never mix namespaces without asking

## At session end (if the user says goodbye / wraps up)
Summarise what was stored: "I've remembered X, Y, Z for next time."
```

### Full (autonomous agent)

```
You are an AI assistant with persistent knowledge-graph memory via MCP.
Your memory survives across sessions — use it proactively.

## Session start protocol (ALWAYS do this)
1. memory_search("<user name or topic>") — load relevant entities
2. memory_get_graph("<main entity>", depth=2) — see connected context
3. Greet the user with a brief summary of what you remember about them

## Continuous memory hygiene
Store IMMEDIATELY when you learn:
  - A new person → memory_add_entities (type: "person")
  - A new project → memory_add_entities (type: "project")
  - A preference → memory_add_observations
  - A relationship → memory_add_relations
  - A decision + rationale → entity + observation
  - A problem solved → observation on the relevant entity

Update when facts change:
  - Old fact wrong → memory_delete_observation, then add corrected one
  - Project status changes → new observation ("ProjectX moved to production on 2024-12")
  - Relationship ends → memory_delete_relation

## Namespace strategy
  - "default"           — personal preferences, background facts
  - "<project-name>"    — all facts scoped to that project
  - "work" / "personal" — broad context separation

## Prioritise recall quality
- Use memory_get_graph to find second-degree connections
- Use memory_search with synonyms if first search returns nothing
- When uncertain, call memory_list_entities to browse

## What NOT to store
- Temporary/conversational context that won't matter next session
- Sensitive secrets or credentials
- Exact conversation transcripts (summarise instead)
- Information the user explicitly says not to remember
```

---

## Usage patterns

### Pattern 1 — Onboarding a new user

When someone introduces themselves for the first time:

```
User: "I'm Alice, I'm a senior engineer at Acme Corp working on a TypeScript monorepo called ProjectX."

Claude should call:
memory_add_entities([
  { name: "Alice_Smith", type: "person" },
  { name: "Acme_Corp", type: "company" },
  { name: "ProjectX", type: "project" },
  { name: "TypeScript", type: "tool" }
])

memory_add_relations([
  { from: "Alice_Smith", relation: "WORKS_AT", to: "Acme_Corp" },
  { from: "Alice_Smith", relation: "WORKS_ON", to: "ProjectX" },
  { from: "ProjectX", relation: "USES", to: "TypeScript" }
])

memory_add_observations([
  { entity: "Alice_Smith", content: "Senior engineer at Acme Corp" },
  { entity: "ProjectX", content: "TypeScript monorepo architecture" }
])
```

### Pattern 2 — Capturing a decision

```
User: "We decided to use Postgres instead of MySQL because we need JSONB support."

memory_add_entities([{ name: "Decision_Use_Postgres", type: "decision" }])

memory_add_relations([
  { from: "ProjectX", relation: "USES", to: "PostgreSQL" },
  { from: "Decision_Use_Postgres", relation: "PART_OF", to: "ProjectX" }
])

memory_add_observations([
  { entity: "Decision_Use_Postgres", content: "Chose PostgreSQL over MySQL for JSONB column support" },
  { entity: "ProjectX", content: "Uses PostgreSQL 16 as primary database" }
])
```

### Pattern 3 — Session start recall

At the start of a new session with a returning user:

```
# Claude calls these automatically if the system prompt instructs it to:
memory_search("Alice")          → finds Alice_Smith + her projects
memory_get_graph("ProjectX", 2) → finds ProjectX + TypeScript + Postgres + decisions
```

Claude can then open with:
> "Welcome back, Alice. Last time we were working on ProjectX — the TypeScript
> monorepo using PostgreSQL. Anything specific you'd like to pick up?"

### Pattern 4 — Correcting wrong information

```
User: "Actually I moved to a new team — I'm now working on ProjectY."

# Remove old relation
memory_delete_relation("Alice_Smith", "WORKS_ON", "ProjectX")

# Add new entity and relation
memory_add_entities([{ name: "ProjectY", type: "project" }])
memory_add_relations([{ from: "Alice_Smith", relation: "WORKS_ON", to: "ProjectY" }])

# Add a historical observation so we don't lose the history
memory_add_observations([
  { entity: "Alice_Smith", content: "Previously worked on ProjectX, moved to ProjectY in 2025-01" }
])
```

### Pattern 5 — Multi-project namespaces

```
# Work context
memory_add_entities([{ name: "Alice_Smith", type: "person" }], namespace: "work")
memory_add_observations([{ entity: "Alice_Smith", content: "Prefers detailed code reviews" }], namespace: "work")

# Personal context
memory_add_entities([{ name: "Alice_Smith", type: "person" }], namespace: "personal")
memory_add_observations([{ entity: "Alice_Smith", content: "Learning Rust in spare time" }], namespace: "personal")

# ProjectX-specific context
memory_add_entities([{ name: "auth_service", type: "service" }], namespace: "ProjectX")
memory_add_relations([{ from: "auth_service", relation: "DEPENDS_ON", to: "Redis" }], namespace: "ProjectX")
```

---

## Connecting to Claude Desktop (recommended setup)

The most seamless setup is STDIO mode — Claude Desktop launches the memory
server automatically and it's always available:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-hub/servers/memory/dist/index.js",
        "--stdio"
      ],
      "env": {
        "MEMORY_DB_PATH": "/Users/you/.mcp-hub/memory.db",
        "MEMORY_DEFAULT_NAMESPACE": "default",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Then paste the **Standard system prompt** above into:
Settings → Claude → Custom Instructions (or equivalent in your version).

---

## Inspecting your knowledge graph

### From the terminal

```bash
# Check what's stored
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_stats","arguments":{}}}' | python3 -m json.tool

# List all namespaces
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_list_namespaces","arguments":{}}}' | python3 -m json.tool

# Search for something
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_search","arguments":{"query":"Alice","namespace":"default"}}}' | python3 -m json.tool

# Export everything as JSON
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_export","arguments":{"namespace":"default"}}}' \
  | python3 -m json.tool > my-memory-export.json
```

### Directly via SQLite (advanced)

```bash
# Install sqlite3 CLI if not present
sudo apt install sqlite3   # Ubuntu
brew install sqlite3       # macOS

# Open the database
sqlite3 ~/.mcp-hub/memory.db

# Useful queries
.headers on
.mode table

SELECT name, type, updated_at FROM entities WHERE namespace='default' ORDER BY updated_at DESC LIMIT 20;

SELECT from_entity, relation_type, to_entity, strength
FROM relations WHERE namespace='default';

SELECT entity_name, content, created_at
FROM observations WHERE namespace='default' ORDER BY created_at DESC LIMIT 30;

-- Full-text search directly
SELECT entity_name, content FROM memory_fts WHERE memory_fts MATCH 'typescript*';
```

---

## Backup and restore

The entire knowledge graph is a single SQLite file:

```bash
# Backup
cp ~/.mcp-hub/memory.db ~/.mcp-hub/memory.db.backup-$(date +%Y%m%d)

# Restore
cp ~/.mcp-hub/memory.db.backup-20250115 ~/.mcp-hub/memory.db

# Verify
sqlite3 ~/.mcp-hub/memory.db "SELECT COUNT(*) FROM entities;"
```

For automated backups, add to cron:
```bash
# Daily backup at 2am, keep last 7 days
0 2 * * * cp ~/.mcp-hub/memory.db ~/.mcp-hub/backups/memory-$(date +\%Y\%m\%d).db && find ~/.mcp-hub/backups -name "memory-*.db" -mtime +7 -delete
```

---

## Open-source alternatives considered

These are the main options evaluated before building this implementation:

| Project | Storage | Strengths | Why not used here |
|---------|---------|-----------|------------------|
| `@modelcontextprotocol/servers/memory` | JSONL | Official, simple | No full-text search; JSONL corrupts on crash; not scalable |
| `mcp-knowledge-graph` (shaneholloman) | JSONL | Multi-namespace `.aim` format | Same JSONL drawbacks |
| **Graphiti / Zep** | Neo4j | Temporal graph, tracks fact changes over time | Requires running Neo4j daemon; heavy setup |
| **mcp-memory-service** (doobidoo) | ChromaDB | Semantic/fuzzy search via embeddings | Requires Python + ChromaDB daemon + embedding model |
| **Mem0** | PostgreSQL + vector DB | Production-grade, multi-user | Cloud-first; requires Postgres + vector extension |

**This implementation** uses SQLite with FTS5 — zero external dependencies, single file,
crash-safe WAL mode, full-text search with Porter stemming, graph traversal, and namespaces.
Equivalent in power to the JSONL options but far more reliable and queryable.
