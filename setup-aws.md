# AWS Deployment Guide

This guide walks you through deploying MCP Hub to **AWS ECS Fargate** — a
managed container service that runs your servers in the cloud without you
having to manage any virtual machines.

---

## Architecture overview

```
Internet / Claude clients
         │
         ▼
┌─────────────────────────┐
│  Application Load       │
│  Balancer (ALB)         │  ← single entry point, routes by path
└────────────┬────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌──────────┐    ┌──────────┐
│ ECS Task │    │ ECS Task │  ← Fargate (serverless containers)
│ google-  │    │ (next    │
│ search   │    │  server) │
│ :3001    │    │ :3002    │
└──────────┘    └──────────┘
    │                │
    ▼                ▼
┌─────────────────────────┐
│  Amazon ECR             │  ← Docker image registry
│  (container images)     │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│  CloudWatch Logs        │  ← logs from all servers
└─────────────────────────┘
```

**Cost estimate** (us-east-1, as of 2025):
- ECS Fargate (0.25 vCPU, 0.5 GB): ~$9/month per server (FARGATE_SPOT cuts this by ~70%)
- Application Load Balancer: ~$16/month base
- ECR storage: ~$0.10/GB/month (images are small)
- **Total for one server: ~$10–25/month**

---

## Prerequisites

### 1 — AWS account

If you don't have one: [aws.amazon.com](https://aws.amazon.com) → Create account.  
You'll need a credit card, but won't be charged for the free tier / small usage.

### 2 — AWS CLI installed and configured

**Install:**
- macOS: `brew install awscli`
- Windows: [Download installer](https://aws.amazon.com/cli/)
- Linux: `sudo apt install awscli` or `pip install awscli`

**Verify:**
```bash
aws --version
# Should show: aws-cli/2.x.x
```

**Configure with your credentials:**
```bash
aws configure
```
Enter:
- AWS Access Key ID → from IAM (see Step 1 below)
- AWS Secret Access Key → from IAM
- Default region → e.g. `us-east-1`
- Default output format → `json`

### 3 — Docker Desktop

Install from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop).  
Make sure it's running before you deploy (you'll see the whale icon in your menu bar).

### 4 — jq (optional, for nicer output)

```bash
brew install jq          # macOS
sudo apt install jq      # Ubuntu/Debian
```

---

## Step 1 — Create an IAM user for deployments

Never use your root AWS account for day-to-day work. Create a dedicated user:

1. Go to [console.aws.amazon.com/iam](https://console.aws.amazon.com/iam)
2. **Users** → **Create user**
3. Name: `mcp-hub-deployer`
4. Click **Next** → **Attach policies directly**
5. Search for and attach these policies:
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AmazonECS_FullAccess`
   - `CloudWatchLogsFullAccess`
6. Click **Create user**
7. Click on the new user → **Security credentials** tab
8. **Create access key** → choose "CLI" → copy both keys

Then run `aws configure` again with these keys.

---

## Step 2 — Configure .env.aws

```bash
cp .env.example .env.aws
```

Open `.env.aws` and fill in:

```bash
DEPLOY_ENV=aws
NODE_ENV=production
LOG_LEVEL=info

# Your Google credentials (same as local)
GOOGLE_API_KEY=AIzaSyD...
GOOGLE_CSE_ID=a1b2c3d4e5:name
GOOGLE_SEARCH_ENABLED=true
GOOGLE_SEARCH_PORT=3001

# AWS settings — find these in your AWS console
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012          ← your 12-digit account ID
ECR_REPO_PREFIX=mcp-hub
ECS_CLUSTER_NAME=mcp-hub-cluster
```

**How to find your Account ID:**
```bash
aws sts get-caller-identity --query Account --output text
```

---

## Step 3 — Create AWS infrastructure (one-time)

Run the setup script. This creates ECR repositories, an ECS cluster, and
CloudWatch log groups:

```bash
chmod +x scripts/setup-aws-infra.sh
./scripts/setup-aws-infra.sh
```

Expected output:
```
🏗   Setting up MCP Hub infrastructure in us-east-1…

📦  Creating ECR repository: mcp-hub/google-search
   ✓ Created

🖥   Creating ECS Cluster: mcp-hub-cluster
   ✓ Created

📋  Creating CloudWatch log group: /mcp-hub/google-search
   ✓ Created

✅  Infrastructure ready!
```

---

## Step 4 — Create the VPC and networking (console)

ECS needs a VPC (network) to run in. The easiest path is to use the **default VPC**
that AWS creates automatically in every account.

**Find your default VPC subnets:**
```bash
aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query "Subnets[*].{ID:SubnetId,AZ:AvailabilityZone}" \
  --output table
```

Copy two or more subnet IDs — you'll need them in Step 5.

**Find your default security group:**
```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=default" \
  --query "SecurityGroups[*].GroupId" \
  --output text
```

**Open port 3001 in the security group** (so the load balancer can reach the container):
```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-XXXXXXXXX \        ← replace with your security group ID
  --protocol tcp \
  --port 3001 \
  --cidr 0.0.0.0/0
```

---

## Step 5 — Create the ECS Task Definition

A Task Definition tells ECS what Docker image to run, how much CPU/memory to give it,
and what environment variables to pass.

**First, create an IAM role for ECS tasks** (one-time):

```bash
# Create the role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

# Attach the managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**Register the Task Definition** (replace `YOUR_ACCOUNT_ID` and `YOUR_REGION`):

```bash
aws ecs register-task-definition --cli-input-json '{
  "family": "mcp-google-search",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [{
    "name": "google-search",
    "image": "YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com/mcp-hub/google-search:latest",
    "portMappings": [{"containerPort": 3001, "protocol": "tcp"}],
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "LOG_LEVEL", "value": "info"},
      {"name": "GOOGLE_SEARCH_PORT", "value": "3001"},
      {"name": "TRANSPORT", "value": "http"}
    ],
    "secrets": [],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/mcp-hub/google-search",
        "awslogs-region": "YOUR_REGION",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 10
    }
  }]
}'
```

> **Security best practice**: Store API keys in **AWS Secrets Manager** instead
> of plain environment variables. See the "Secrets Manager" section below.

---

## Step 6 — Store API keys securely in Secrets Manager

```bash
# Store Google credentials as secrets
aws secretsmanager create-secret \
  --name "mcp-hub/google-search/GOOGLE_API_KEY" \
  --secret-string "AIzaSyD..."

aws secretsmanager create-secret \
  --name "mcp-hub/google-search/GOOGLE_CSE_ID" \
  --secret-string "a1b2c3d4e5:name"
```

Then update the Task Definition to use `secrets` instead of `environment` for
these values:

```json
"secrets": [
  {
    "name": "GOOGLE_API_KEY",
    "valueFrom": "arn:aws:secretsmanager:YOUR_REGION:YOUR_ACCOUNT_ID:secret:mcp-hub/google-search/GOOGLE_API_KEY"
  },
  {
    "name": "GOOGLE_CSE_ID",
    "valueFrom": "arn:aws:secretsmanager:YOUR_REGION:YOUR_ACCOUNT_ID:secret:mcp-hub/google-search/GOOGLE_CSE_ID"
  }
]
```

Also attach the Secrets Manager policy to your task execution role:
```bash
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

---

## Step 7 — Create the ECS Service

An ECS Service keeps your task running and restarts it if it crashes.

```bash
aws ecs create-service \
  --cluster mcp-hub-cluster \
  --service-name mcp-google-search \
  --task-definition mcp-google-search \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-XXXXXX,subnet-YYYYYY],
    securityGroups=[sg-ZZZZZZZZ],
    assignPublicIp=ENABLED
  }" \
  --region YOUR_REGION
```

Replace:
- `subnet-XXXXXX,subnet-YYYYYY` → your subnet IDs from Step 4
- `sg-ZZZZZZZZ` → your security group ID from Step 4

**Wait for the service to stabilize:**
```bash
aws ecs wait services-stable \
  --cluster mcp-hub-cluster \
  --services mcp-google-search
```

---

## Step 8 — Deploy your first image

Now you can build and push the Docker image, and the ECS service will pick it up:

```bash
chmod +x scripts/deploy-aws.sh
./scripts/deploy-aws.sh
```

Output:
```
🔐  Logging in to ECR…
━━━  google-search  ━━━━━━━━━━━━━━━━
🔨  Building image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/mcp-hub/google-search:latest
📤  Pushing…
🔄  Updating ECS service: mcp-hub-cluster/mcp-google-search
✅  Deployment complete!
```

---

## Step 9 — Find your server's public IP

```bash
# Get the task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster mcp-hub-cluster \
  --service-name mcp-google-search \
  --query "taskArns[0]" \
  --output text)

# Get the ENI (network interface) attached to the task
ENI=$(aws ecs describe-tasks \
  --cluster mcp-hub-cluster \
  --tasks $TASK_ARN \
  --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" \
  --output text)

# Get the public IP
aws ec2 describe-network-interfaces \
  --network-interface-ids $ENI \
  --query "NetworkInterfaces[0].Association.PublicIp" \
  --output text
```

Test it:
```bash
curl http://<PUBLIC_IP>:3001/health
```

---

## Step 10 — Set up an Application Load Balancer (optional but recommended)

A load balancer gives you:
- A stable hostname (no changing IPs)
- HTTPS / TLS termination
- Easy path-based routing to multiple servers

**Create via AWS Console** (easier than CLI for beginners):

1. Go to **EC2** → **Load Balancers** → **Create load balancer**
2. Choose **Application Load Balancer**
3. Name: `mcp-hub-alb`
4. Scheme: **Internet-facing**
5. Add your subnets
6. Create a target group pointing to port 3001
7. Register your ECS tasks as targets

For HTTPS, request a free certificate via **AWS Certificate Manager (ACM)**:
```bash
aws acm request-certificate \
  --domain-name mcp.yourdomain.com \
  --validation-method DNS
```

---

## Updating after code changes

Every time you push a code change, redeploy with:

```bash
./scripts/deploy-aws.sh
# or for a specific server:
./scripts/deploy-aws.sh google-search
```

This: builds a new Docker image → pushes to ECR → triggers a rolling ECS deployment.
ECS will start the new version, wait for it to be healthy, then stop the old one.
**Zero downtime.**

---

## Viewing logs

```bash
# Tail logs from CloudWatch
aws logs tail /mcp-hub/google-search --follow

# Last 100 lines
aws logs tail /mcp-hub/google-search --since 1h
```

Or view in the console: **CloudWatch** → **Log groups** → `/mcp-hub/google-search`

---

## Connecting Claude to your AWS server

Once you have a public IP or ALB hostname, update your Claude Desktop config:

```json
{
  "mcpServers": {
    "google-search": {
      "url": "http://<YOUR_IP_OR_HOSTNAME>:3001/mcp"
    }
  }
}
```

For HTTPS with a load balancer:
```json
{
  "mcpServers": {
    "google-search": {
      "url": "https://mcp.yourdomain.com/google-search/mcp"
    }
  }
}
```

---

## Troubleshooting

### Task keeps restarting / never becomes healthy

```bash
# Check the stopped task's error
aws ecs describe-tasks \
  --cluster mcp-hub-cluster \
  --tasks $(aws ecs list-tasks --cluster mcp-hub-cluster --desired-status STOPPED --query "taskArns[0]" --output text) \
  --query "tasks[0].stoppedReason"

# Check CloudWatch logs
aws logs tail /mcp-hub/google-search --since 30m
```

Common causes:
- Missing environment variables (check GOOGLE_API_KEY, GOOGLE_CSE_ID)
- Image wasn't pushed to ECR before the service started
- Security group not open on port 3001

### "No space left on device" when building

```bash
docker system prune -af
```

### Cannot connect to ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

---

## Cost control tips

- Use **FARGATE_SPOT** capacity provider (up to 70% cheaper) — already configured in `setup-aws-infra.sh`
- Set `desired-count 0` when not in use: `aws ecs update-service --cluster mcp-hub-cluster --service mcp-google-search --desired-count 0`
- Set CloudWatch log retention to 7 days instead of 30 to save on storage
- Use **Reserved Concurrency** if you know your usage pattern

---

## Next steps

- [Add another MCP server](adding-new-server.md)
- Set up a CI/CD pipeline — see `.github/workflows/`
