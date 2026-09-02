# Use slim base image for smaller size
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY servers/browser/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY servers/browser/ .

# Build the application
RUN npm run build

# Production runtime stage
FROM node:20-slim AS runtime

# Install only essential dependencies for Lightpanda
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes13 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Install only production dependencies
RUN npm ci --omit=dev

# Create non-root user for security
RUN useradd -m appuser
USER appuser

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
