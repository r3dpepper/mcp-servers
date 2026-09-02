# Plan: Add Git MCP Server

**Server**: git
**Port**: 3004
**API Keys Required**: None
**Complexity**: Medium

---

## Overview

The Git MCP Server provides programmatic access to Git repository operations - status, log, diff, add, commit, branch management, etc. Essential for automated Git workflows.

## Implementation Steps

### 1. Copy Template
```bash
cp -r servers/duckduckgo-search servers/git
```

### 2. Update package.json
- Name: `@mcp-hub/git`
- Description: "MCP server for Git repository operations"
- Add `simple-git` dependency for Git operations

### 3. Create Tools

**`src/tools/git-status.ts`**:
- Input: repo_path (optional)
- Output: staged, modified, untracked files

**`src/tools/git-log.ts`**:
- Input: count (1-100), branch (optional)
- Output: commit history with hash, message, author, date

**`src/tools/git-diff.ts`**:
- Input: file (optional), staged (boolean)
- Output: diff output

**`src/tools/git-add.ts`**:
- Input: files (string array)
- Output: success

**`src/tools/git-commit.ts`**:
- Input: message (string), files (optional)
- Output: commit hash

**`src/tools/git-branch.ts`**:
- Input: action (list, create, delete), name (optional)
- Output: branch list or result

### 4. Update config.ts
- PORT: 3004
- REPO_PATH: default to workspace root

### 5. Update src/index.ts
- Register all Git tools
- Add repository validation

### 6. Docker Configuration
```bash
mkdir -p docker/git
# Similar to filesystem, mount workspace
```

### 7. Update docker-compose.yml
```yaml
git:
  build:
    context: ..
    dockerfile: docker/git/Dockerfile
  volumes:
    - .:/workspace
  working_dir: /workspace
```

### 8. Update CLAUDE.md
- Add git server to table

---

## Security Considerations

- [ ] Repository path validation
- [ ] Prevent pushing to protected branches (configurable)
- [ ] Commit message validation
- [ ] Size limits on diff output

## Testing Plan

1. Health check
2. `git status` in workspace
3. `git log` with count=5
4. `git diff` for changes
5. Commit test file

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `servers/git/src/tools/git-status.ts` | Create |
| `servers/git/src/tools/git-log.ts` | Create |
| `servers/git/src/tools/git-diff.ts` | Create |
| `servers/git/src/tools/git-add.ts` | Create |
| `servers/git/src/tools/git-commit.ts` | Create |
| `servers/git/src/tools/git-branch.ts` | Create |
| `servers/git/src/index.ts` | Update |
| `docker/git/Dockerfile` | Create |
| `docker-compose.yml` | Update |
| `CLAUDE.md` | Update |