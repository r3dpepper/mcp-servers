#!/bin/bash
# Prevent commits containing potential secrets

INPUT=$(cat)
COMMIT_MSG=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMIT_MSG" ] || [[ ! "$COMMIT_MSG" =~ ^git\ commit ]]; then
  exit 0
fi

# Check staged files for secrets
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Patterns that might indicate secrets
SECRET_PATTERNS=(
  '[A-Za-z0-9_-]*[AaPpIi]_?[Kk][Ee][Yy][A-Za-z0-9_-]*["\x27][^"\x27]{16,}'
  '[A-Za-z0-9_-]*[Ss][Ee][Cc][Rr][Ee][Tt][A-Za-z0-9_-]*["\x27][^"\x27]{8,}'
  '[A-Za-z0-9_-]*[Tt][Oo][Kk][Ee][Nn][A-Za-z0-9_-]*["\x27][^"\x27]{16,}'
  '-----BEGIN.*PRIVATE KEY-----'
  '[A-Za-z0-9_-]*pa?ssw?o?r?d?[A-Za-z0-9_-]*["\x27][^"\x27]{8,}'
)

SECURE_EXIT_CODE=2

for file in $STAGED_FILES; do
  # Skip generated files that commonly trigger false positives
  if [[ "$file" == "package-lock.json" || "$file" == "yarn.lock" || "$file" == "pnpm-lock.yaml" ]]; then
    continue
  fi
  if [ -f "$file" ]; then
    for pattern in "${SECRET_PATTERNS[@]}"; do
      if grep -iE "$pattern" "$file" > /dev/null 2>&1; then
        echo "Blocked: Potential secret detected in $file" >&2
        echo "Pattern matched: $pattern" >&2
        exit $SECURE_EXIT_CODE
      fi
    done
  fi
done

exit 0