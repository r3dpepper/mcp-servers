---
name: commit
description: Generate a git commit with a properly formatted message
---

# commit

Generate a git commit with a properly formatted message.

## Usage
```
/commit <title>
```

## Format

The commit message will have:
- A single-line title
- A "Summary:" section with bulleted changes

Example:
```
Add DuckDuckGo search tool

Summary:
- Add: servers/ddg-search/src/index.ts
- Update: README.md
- Chore: package.json
```

## Instructions

1. Check git status for staged changes
2. Generate a commit message with single-line title and Summary section
3. Run `git commit` with the formatted message
4. Do NOT add Co-Authored-By trailer