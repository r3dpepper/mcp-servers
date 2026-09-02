#!/bin/bash
# Validate rm commands to prevent accidental deletion of important files

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Check for rm commands that could be dangerous
if [[ "$COMMAND" == rm* ]]; then
  # Block dangerous rm patterns
  DANGEROUS_PATTERNS='rm ( -rf\s+\(|\s+-rf /|\s+-rf \.)'

  if echo "$COMMAND" | grep -iE "$DANGEROUS_PATTERNS" > /dev/null; then
    echo "Blocked: Potentially destructive rm command detected" >&2
    echo "Command: $COMMAND" >&2
    echo "Use --force flag to override if absolutely necessary" >&2
    exit 2
  fi
fi

exit 0