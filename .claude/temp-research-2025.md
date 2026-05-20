# MCP Server Development - Security & Workflow Research

*Generated: 2026-05-19*
*Sources: Claude Code docs, MintMCP security analysis, 100 MCP servers audit*

---

## 1. Critical Security Vulnerabilities Found in MCP Servers (43% of 100 analyzed)

### 1.1 Command Injection (12% of vulnerable)
- Shell commands executed with user-controlled input
- No sanitization of arguments passed to child processes
- **Fix**: Use `exec` instead of `spawn` with shell option, validate inputs

### 1.2 Path Traversal (9% of vulnerable)
- File access without validating paths
- `../../etc/passwd` style attacks possible
- **Fix**: Use `path.resolve()` and check against base directory

### 1.3 SSRF (Server-Side Request Forgery) (8% of vulnerable)
- URLs fetched without validation
- Internal network scanning possible
- **Fix**: Block private IP ranges, validate URL schemes

### 1.4 Secrets Exposure (7% of vulnerable)
- API keys in responses
- `.env` files in codebase
- **Fix**: Never return credentials, add `.env` to gitignore

### 1.5 Missing Input Validation (7% of vulnerable)
- No size limits on requests
- No rate limiting
- **Fix**: Implement request limits, rate limiting

---

## 2. Claude Code Workflow Enhancements (2025 Best Practices)

### 2.1 Agent Patterns

**Code Review Agent** (`agents/code-reviewer.md`):
```yaml
---
name: code-reviewer
description: Reviews code for security and style issues
tools: Read, Grep, Glob
model: sonnet
---
Focus: Type safety, error handling, security patterns
```

**API Integration Agent** (`agents/api-integrator.md`):
```yaml
---
name: api-integrator
description: Builds and tests API integrations
tools: Read, Bash(curl *), Bash(npm *)
model: sonnet
---
Focus: HTTP clients, rate limiting, auth
```

### 2.2 Security Hooks

**Prevent Secrets in Commits** (`.claude/scripts/prevent-secrets.sh`):
```bash
#!/bin/bash
# Check for common secret patterns
if git diff --cached | grep -iE '(api_key|password|secret|token|private_key)\s*=\s*["\'][^"\']{10,}'; then
  echo "Potential secret detected - commit blocked"
  exit 2
fi
```

**Pre-Push Security Check** (`.claude/scripts/pre-push.sh`):
```bash
#!/bin/bash
# Run npm audit before push
npm audit --audit-level=moderate
```

### 2.3 Skills for MCP Development

**`/create-mcp-tool`**:
- Scaffold a new MCP tool with proper validation
- Template: schema, handler, error handling

**`/security-check`**:
- Run security audit on codebase
- Check for common vulnerabilities
- Generate security report

---

## 3. MCP Server Best Practices (from MCP Market analysis)

### 3.1 Tool Design
- Each tool should have a single responsibility
- Use zod schemas for input validation
- Return structured errors with context
- Document expected inputs/outputs

### 3.2 Error Handling
```typescript
// Good pattern
try {
  const result = await api.call(input);
  return { content: [{ type: "text", text: format(result) }] };
} catch (error) {
  return {
    content: [{ type: "text", text: `Operation failed: ${error.message}` }],
    isError: true
  };
}
```

### 3.3 Resource Management
- Implement timeouts for external API calls
- Use connection pooling for database connections
- Handle backpressure in streaming responses

---

## 4. Tech Stack Recommendations for MCP Servers

### 4.1 Core
- TypeScript 5.x with ES modules
- Zod for validation
- Node.js 18+ (for fetch API)

### 4.2 Development Tools
- Vitest for testing
- ESLint + Prettier
- Husky for git hooks

### 4.3 Security Tools
- `npm audit` for dependency scanning
- `helmet` for HTTP security headers
- `rate-limiter-flexible` for rate limiting

### 4.4 Optional Enhancements
- Pino for structured logging
- OpenTelemetry for tracing
- Prometheus metrics endpoint

---

## 5. Implementation Checklist

### Immediate Actions
- [ ] Add `DUCKDUCKGO_TIMEOUT_MS` to environment docs
- [ ] Validate decoded URLs in extractRealUrl function
- [ ] Add request body size limit (1MB)
- [ ] Add rate limiting (100 req/min per IP)

### Short-term
- [ ] Create `/security-check` skill
- [ ] Add pre-commit hook for secrets
- [ ] Add input size validation on all tools
- [ ] Implement optional API key auth for HTTP mode

### Long-term
- [ ] Add comprehensive test suite
- [ ] Add OpenTelemetry tracing
- [ ] Implement circuit breaker for external APIs
- [ ] Add health check with dependency status

---

## 6. Sources

1. [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
2. [MintMCP Security Analysis](https://www.mintmcp.com/blog/claude-code-security)
3. [100 MCP Servers Security Audit](https://dev.to/amir_mironi/i-analyzed-100-claude-mcp-servers-and-found-critical-security-flaws-in-43-of-them-ikj)
4. [MCP Market Best Practices](https://mcpmarket.com/tools/skills/mcp-server-best-practices)
5. [OWASP MCP Security](https://owasp.org/www-chapter-stuttgart/assets/slides/2025-09-25_All_About_MCP_Security.pdf)

---

*This is a temporary research document. Move actionable items to project planning.*