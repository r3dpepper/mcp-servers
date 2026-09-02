# Plan: Add PostgreSQL MCP Server

**Server**: postgresql
**Port**: 3005
**API Keys Required**: DATABASE_URL
**Complexity**: Medium

---

## Overview

The PostgreSQL MCP Server provides query access to PostgreSQL databases. Allows schema inspection, query execution, and data analysis.

## Implementation Steps

### 1. Copy Template
```bash
cp -r servers/duckduckgo-search servers/postgresql
```

### 2. Update package.json
- Name: `@mcp-hub/postgresql`
- Description: "MCP server for PostgreSQL database access"
- Add `pg` (node-postgres) dependency

### 3. Create Tools

**`src/tools/query.ts`**:
- Input: sql (string), params (optional)
- Output: rows with columns
- Validations: read-only queries, statement timeout

**`src/tools/list-tables.ts`**:
- Output: table names with schemas

**`src/tools/describe-table.ts`**:
- Input: table (string)
- Output: column names, types, constraints

**`src/tools/list-schemas.ts`**:
- Output: schema names

### 4. Update config.ts
- PORT: 3005
- DATABASE_URL: connection string
- QUERY_TIMEOUT_MS: default 30000
- MAX_RESULTS: default 100

### 5. Update src/index.ts
- Register tools
- Handle connection pooling
- Add query timeout

### 6. Docker Configuration
```bash
mkdir -p docker/postgresql
# Need libpq or use pg with SSL
```

### 7. Update docker-compose.yml
```yaml
postgresql:
  build:
    context: ..
    dockerfile: docker/postgresql/Dockerfile
  environment:
    - DATABASE_URL=${DATABASE_URL}
  # No volumes needed
```

### 8. Update CLAUDE.md
- Add postgresql server to table
- Document DATABASE_URL requirement

---

## Security Considerations

- [ ] Read-only mode by default
- [ ] Query timeout (prevent long-running queries)
- [ ] Result count limits
- [ ] Block dangerous keywords: DROP, DELETE, UPDATE, ALTER
- [ ] Connection pooling for efficiency

## Testing Plan

1. Health check
2. Query `SELECT 1` as connectivity test
3. List tables
4. Describe a table
5. Simple SELECT query

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `servers/postgresql/src/tools/query.ts` | Create |
| `servers/postgresql/src/tools/list-tables.ts` | Create |
| `servers/postgresql/src/tools/describe-table.ts` | Create |
| `servers/postgresql/src/tools/list-schemas.ts` | Create |
| `servers/postgresql/src/index.ts` | Update |
| `servers/postgresql/src/pg-client.ts` | Create |
| `docker/postgresql/Dockerfile` | Create |
| `docker-compose.yml` | Update |
| `CLAUDE.md` | Update |