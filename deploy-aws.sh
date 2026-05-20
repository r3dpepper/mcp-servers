#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-aws.sh
#
# Builds Docker images, pushes them to Amazon ECR, and updates the ECS
# services for all enabled MCP servers.
#
# Prerequisites:
#   • AWS CLI v2 installed and configured (aws configure)
#   • Docker Desktop / Docker Engine running
#   • .env.aws filled in (copy from .env.example)
#   • ECR repositories already created (run scripts/setup-aws-infra.sh first)
#
# Usage:
#   chmod +x scripts/deploy-aws.sh
#   ./scripts/deploy-aws.sh                    # deploys all enabled servers
#   ./scripts/deploy-aws.sh google-search      # deploys a specific server
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT}/.env.aws"

# ── Load .env.aws ────────────────────────────────────────────────────────────
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌  ${ENV_FILE} not found."
  echo "   Run:  cp .env.example .env.aws  then fill in your AWS values."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

: "${AWS_REGION:?AWS_REGION must be set in .env.aws}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID must be set in .env.aws}"
: "${ECR_REPO_PREFIX:?ECR_REPO_PREFIX must be set in .env.aws}"
: "${ECS_CLUSTER_NAME:?ECS_CLUSTER_NAME must be set in .env.aws}"

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# ── Server list ──────────────────────────────────────────────────────────────
# Add entries here when you add new servers.
declare -A SERVER_ENABLED=(
  [google-search]="${GOOGLE_SEARCH_ENABLED:-true}"
  # [brave-search]="${BRAVE_SEARCH_ENABLED:-false}"
)

declare -A SERVER_SERVICE=(
  [google-search]="mcp-google-search"
  # [brave-search]="mcp-brave-search"
)

TARGET="${1:-}"   # optional: deploy only one server

# ── ECR login ────────────────────────────────────────────────────────────────
echo "🔐  Logging in to ECR (${ECR_REGISTRY})…"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── Build & push ─────────────────────────────────────────────────────────────
for server in "${!SERVER_ENABLED[@]}"; do
  if [[ -n "${TARGET}" && "${server}" != "${TARGET}" ]]; then
    continue
  fi

  if [[ "${SERVER_ENABLED[$server]}" != "true" ]]; then
    echo "⏭   ${server} — disabled, skipping"
    continue
  fi

  echo ""
  echo "━━━  ${server}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  IMAGE_TAG="${ECR_REGISTRY}/${ECR_REPO_PREFIX}/${server}:latest"
  DOCKERFILE="${ROOT}/docker/${server}/Dockerfile"

  if [[ ! -f "${DOCKERFILE}" ]]; then
    echo "⚠️   Dockerfile not found: ${DOCKERFILE} — skipping"
    continue
  fi

  echo "🔨  Building image: ${IMAGE_TAG}"
  docker build \
    --platform linux/amd64 \
    -f "${DOCKERFILE}" \
    -t "${IMAGE_TAG}" \
    "${ROOT}"

  echo "📤  Pushing: ${IMAGE_TAG}"
  docker push "${IMAGE_TAG}"

  ECS_SERVICE="${SERVER_SERVICE[$server]}"
  echo "🔄  Updating ECS service: ${ECS_CLUSTER_NAME}/${ECS_SERVICE}"
  aws ecs update-service \
    --cluster "${ECS_CLUSTER_NAME}" \
    --service "${ECS_SERVICE}" \
    --force-new-deployment \
    --region "${AWS_REGION}" \
    --output text \
    --query "service.serviceName" \
    || echo "⚠️   ECS update failed — service may not exist yet. See docs/setup-aws.md."
done

echo ""
echo "✅  Deployment complete!"
echo "   Monitor: https://${AWS_REGION}.console.aws.amazon.com/ecs/home?region=${AWS_REGION}#/clusters/${ECS_CLUSTER_NAME}"
