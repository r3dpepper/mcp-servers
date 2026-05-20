#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-aws-infra.sh
#
# One-time script that creates the AWS infrastructure needed to run MCP Hub:
#   • ECR repositories for each server
#   • ECS Cluster (Fargate)
#   • CloudWatch log groups
#
# Run this ONCE before your first deployment.
# Subsequent deployments use deploy-aws.sh.
#
# Usage:
#   chmod +x scripts/setup-aws-infra.sh
#   ./scripts/setup-aws-infra.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT}/.env.aws"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌  ${ENV_FILE} not found."
  echo "   Run:  cp .env.example .env.aws  then fill in your AWS values."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

: "${AWS_REGION:?}"
: "${AWS_ACCOUNT_ID:?}"
: "${ECR_REPO_PREFIX:?}"
: "${ECS_CLUSTER_NAME:?}"

SERVERS=("google-search")   # add server names here as you add them

echo "🏗   Setting up MCP Hub infrastructure in ${AWS_REGION}…"
echo ""

# ── ECR repositories ─────────────────────────────────────────────────────────
for server in "${SERVERS[@]}"; do
  REPO_NAME="${ECR_REPO_PREFIX}/${server}"
  echo "📦  Creating ECR repository: ${REPO_NAME}"
  aws ecr create-repository \
    --repository-name "${REPO_NAME}" \
    --region "${AWS_REGION}" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --output json 2>/dev/null \
    && echo "   ✓ Created" \
    || echo "   ℹ️  Already exists — skipping"
done

# ── ECS Cluster ──────────────────────────────────────────────────────────────
echo ""
echo "🖥   Creating ECS Cluster: ${ECS_CLUSTER_NAME}"
aws ecs create-cluster \
  --cluster-name "${ECS_CLUSTER_NAME}" \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
      capacityProvider=FARGATE_SPOT,weight=4 \
      capacityProvider=FARGATE,weight=1 \
  --region "${AWS_REGION}" \
  --output json 2>/dev/null \
  && echo "   ✓ Created" \
  || echo "   ℹ️  Already exists — skipping"

# ── CloudWatch Log groups ─────────────────────────────────────────────────────
echo ""
for server in "${SERVERS[@]}"; do
  LOG_GROUP="/mcp-hub/${server}"
  echo "📋  Creating CloudWatch log group: ${LOG_GROUP}"
  aws logs create-log-group \
    --log-group-name "${LOG_GROUP}" \
    --region "${AWS_REGION}" \
    2>/dev/null \
    && echo "   ✓ Created" \
    || echo "   ℹ️  Already exists — skipping"

  # Retain logs for 30 days (adjust as needed)
  aws logs put-retention-policy \
    --log-group-name "${LOG_GROUP}" \
    --retention-in-days 30 \
    --region "${AWS_REGION}"
done

echo ""
echo "✅  Infrastructure ready!"
echo ""
echo "Next steps:"
echo "  1. Create ECS Task Definitions and Services (see docs/setup-aws.md)"
echo "  2. Run:  ./scripts/deploy-aws.sh"
