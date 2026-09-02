#!/usr/bin/env node

const testResults = {
  server: "browser",
  port: 3003,
  tests: [],
  timestamp: new Date().toISOString()
};

async function callTool(toolName, args, testId) {
  const response = await fetch("http://localhost:3003/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: testId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  const text = await response.text();
  const lines = text.split("\n").filter(l => l.startsWith("data:"));
  const data = lines.map(l => JSON.parse(l.substring(5)));

  return {
    tool: toolName,
    args,
    response: data,
    success: !text.includes("isError")
  };
}

async function runTests() {
  console.log("Testing Browser MCP Server Tools...\n");

  // Test 1: Navigate
  console.log("1. Testing browser_navigate...");
  const navResult = await callTool("browser_navigate", { url: "https://example.com" }, 1);
  testResults.tests.push(navResult);
  console.log(`   Result: ${navResult.success ? "✓" : "✗"}`);

  // Test 2: Evaluate
  console.log("2. Testing browser_evaluate...");
  const evalResult = await callTool("browser_evaluate", { script: "document.title" }, 2);
  testResults.tests.push(evalResult);
  console.log(`   Result: ${evalResult.success ? "✓" : "✗"}`);

  // Test 3: Extract
  console.log("3. Testing browser_extract...");
  const extractResult = await callTool("browser_extract", { selector: "h1" }, 3);
  testResults.tests.push(extractResult);
  console.log(`   Result: ${extractResult.success ? "✓" : "✗"}`);

  // Test 4: Screenshot
  console.log("4. Testing browser_screenshot...");
  const screenshotResult = await callTool("browser_screenshot", { selector: "body" }, 4);
  testResults.tests.push(screenshotResult);
  console.log(`   Result: ${screenshotResult.success ? "✓" : "✗"}`);

  // Save results
  const fs = await import("fs");
  fs.writeFileSync("output/browser-tool-tests.json", JSON.stringify(testResults, null, 2));
  console.log("\nTest results saved to output/browser-tool-tests.json");
}

runTests().catch(console.error);