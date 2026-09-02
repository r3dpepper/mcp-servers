# Plan: Add Filesystem MCP Server

**Server**: filesystem
**Port**: 3003
**API Keys Required**: None
**Complexity**: Low

---

## Overview

The Filesystem MCP Server provides read/write access to files and directories on the host system. This is essential for any file-based operations, code editing, and configuration management.

## Implementation Steps

### 1. Copy Template
```bash
cp -r servers/duckduckgo-search servers/filesystem
```

### 2. Update package.json
- Change name to `@mcp-hub/filesystem`
- Update description to "MCP server for filesystem operations"
- Dependencies remain similar (MCP SDK, zod)

### 3. Create Tools

**`src/tools/read-file.ts`**:
- Input: path (string, absolute or relative)
- Output: file contents
- Validations: path exists, is readable, size limits

**`src/tools/write-file.ts`**:
- Input: path (string), content (string)
- Output: success message
- Validations: path within allowed directories, size limits

**`src/tools/list-directory.ts`**:
- Input: path (string, optional - defaults to workspace)
- Output: array of files/directories

**`src/tools/create-directory.ts`**:
- Input: path (string)
- Output: success message

### 4. Update config.ts
- PORT: 3003
- BASE_DIR: configurable base directory (default: workspace root)
- Allowlist of accessible paths

### 5. Update src/index.ts
- Register all filesystem tools
- Add path validation middleware
- Implement directory traversal protection

### 6. Docker Configuration
```bash
mkdir -p docker/filesystem
cp docker/duckduckgo-search/Dockerfile docker/filesystem/Dockerfile
# Update path: FROM servers/filesystem to COPY servers/filesystem
```

### 7. Update docker-compose.yml
```yaml
filesystem:
  build:
    context: ..
    dockerfile: docker/filesystem/Dockerfile
  container_name: mcp-filesystem
  ports:
    - "${FILESYSTEM_PORT:-3003}:3003"
  environment:
    - BASE_DIR=/workspace
  volumes:
    - .:/workspace:ro
```

### 8. Update CLAUDE.md
- Add filesystem to server table
- Document tools available

---

## Security Considerations

- [ ] Path traversal protection (no ../ escaping base dir)
- [ ] File size limits (prevent memory exhaustion)
- [ ] Extension filtering (optional block for sensitive files)
- [ ] Read-only mode option

## Testing Plan

1. Health check: `curl http://localhost:3003/health`
2. List workspace: `mcp call list_directory`
3. Read file: `mcp call read_file` with test file
4. Write file: `mcp call write_file` with test content

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `servers/filesystem/src/tools/read-file.ts` | Create |
| `servers/filesystem/src/tools/write-file.ts` | Create |
| `servers/filesystem/src/tools/list-directory.ts` | Create |
| `servers/filesystem/src/index.ts` | Update |
| `docker/filesystem/Dockerfile` | Create |
| `docker-compose.yml` | Update |
| `CLAUDE.md` | Update |