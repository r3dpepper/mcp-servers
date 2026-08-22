---
name: test-search
description: Test search functionality with sample queries. Use when verifying search tools are working correctly.
argument-hint: [query]
allowed-tools: Bash(curl *)
---

# Test Search Tools

Test the search functionality with sample queries.

## Usage

\`/test-search\` - Test with default query
\`/test-search claude mcp\` - Test with custom query

## Test Commands

\`\`\`bash
# Health check
curl -s http://localhost:3002/health | jq .

# Test ddg_search tool
curl -s -X POST http://localhost:3002/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ddg_search","arguments":{"query":"'"${ARGUMENTS:-TypeScript MCP"}'"}}}'
\`\`\`

## Verification

Check that:
1. Health endpoint returns \`{"status":"ok"}\`
2. Search returns results with titles and URLs
3. Response time is reasonable (< 5 seconds)