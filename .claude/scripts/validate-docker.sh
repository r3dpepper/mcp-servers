#!/bin/bash
# Validate Docker commands to prevent destructive operations

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Only check for destructive patterns when command starts with docker
if [[ "$COMMAND" == docker* ]]; then
  # Block dangerous docker subcommands
  DANGEROUS_PATTERNS='docker (rm|system prune|volume rm|network rm|container rm|image rm|kill)'

  if echo "$COMMAND" | grep -iE "$DANGEROUS_PATTERNS" > /dev/null; then
    echo "Blocked: Potentially destructive Docker command detected" >&2
    echo "Command: $COMMAND" >&2
    exit 2
  fi
fi

exit 0