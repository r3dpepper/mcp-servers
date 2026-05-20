# Plan: Add SQLite MCP Server

**Server**: sqlite
**Port**: 3006
**API Keys Required**: None
**Complexity**: Low

---

## Overview

The SQLite MCP Server provides query access to SQLite database files (.db, .sqlite). Useful for local development databases and testing data access.

## Implementation Steps

### 1. Copy Template
```bash
cp -r servers/duckduckgo-search servers/sqlite
```

### 2. Update package.json
- Name: `@mcp-hub/sqlite`
- Description: "MCP server for SQLite database access"
- Add `better-sqlite3` dependency

### 3. Create Tools

**`src/tools/query.ts`**:
- Input: db_path (string), sql (string)
- Output: rows
- Validations: read-only by default, statement timeout

**`src/tools/list-tables.ts`**:
- Input: db_path (string)
- Output: table names

**`src/tools/describe-table.ts`**:
- Input: db_path (string), table (string)
- Output: column info from sqlite_master

### 4. Update config.ts
- PORT: 3006
- DB_DIRECTORY: where database files are stored
- QUERY_TIMEOUT_MS: default 10000
- MAX_RESULTS: default 100

### 5. Update src/index.ts
- Register tools
- Add database path validation

### 6. Docker Configuration
```bash
mkdir -p docker/sqlite
# Mount volume for db files
```

### 7. Update docker-compose.yml
```yaml
sqlite:
  build:
    context: ..
    dockerfile: docker/sqlite/Dockerfile
  environment:
    - DB_DIRECTORY=/data
  volumes:
    - ./data:/data
```

### 8. Update CLAUDE.md
- Add sqlite server to table

---

## Security Considerations

- [ ] Database path validation (no traversal)
- [ ] Read-only mode by default
- [ ] File size limits
- [ ] Query timeout
- [ ] Block write queries by default

## Testing Plan

1. Health check
2. Create test database
3. Query `SELECT 1`
4. List tables
5. Simple SELECT query

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `servers/sqlite/src/tools/query.ts` | Create |
| `servers/sqlite/src/tools/list-tables.ts` | Create |
| `servers/sqlite/src/tools/describe-table.ts` | Create |
| `servers/sqlite/src/index.ts` | Update |
| `servers/sqlite/src/sqlite-client.ts` | Create |
| `docker/sqlite/Dockerfile` | Create |
| `docker-compose.yml` | Update |
| `CLAUDE.md` | Update |