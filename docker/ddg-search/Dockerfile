FROM node:20-alpine AS builder
WORKDIR /app
COPY servers/duckduckgo-search/package*.json ./
RUN npm ci
COPY servers/duckduckgo-search/ .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
RUN npm ci --omit=dev
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "dist/index.js"]