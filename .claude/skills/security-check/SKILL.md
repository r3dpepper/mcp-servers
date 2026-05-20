---
name: security-check
description: Run security audit on the codebase and dependencies. Use before commits or releases.
allowed-tools: Bash(npm audit *), Bash(git log *), Bash(find *), Bash(grep *)
---

# Security Check

Run comprehensive security analysis on the MCP Hub codebase.

## Commands

### 1. Dependency Security Audit
```bash
npm audit --audit-level=moderate
```

### 2. Check for Secrets in Code
```bash
# Look for potential API keys
git grep -iE 'api_key|apikey|secret|token' -- '*.ts' '*.js' | grep -v node_modules | grep -v '.claude/scripts'
```

### 3. Check for Hardcoded Credentials
```bash
# Look for password patterns
find . -name "*.ts" -o -name "*.js" | xargs grep -lE 'password\s*=\s*["\x27]' 2>/dev/null || echo "No hardcoded passwords found"
```

### 4. Check for Environment File Leaks
```bash
find . -name ".env*" -not -name ".env.example" -not -name ".gitignore" 2>/dev/null || echo "No env files found"
```

### 5. Check Recent Commits for Sensitive Data
```bash
git log --oneline -20
```

## Remediation

If issues found:
1. Run `npm audit fix` for dependency vulnerabilities
2. Remove any hardcoded credentials and use environment variables
3. Add `.env.local` to `.gitignore`
4. Rotate any exposed credentials

## Frequency

- Run before every commit
- Run before releases
- Run weekly for dependency updates