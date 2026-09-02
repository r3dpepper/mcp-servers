FROM node:20-alpine AS builder
WORKDIR /app
COPY servers/email/package*.json ./
RUN npm ci
COPY servers/email/ .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
RUN npm ci --omit=dev
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3008/health || exit 1
CMD ["node", "dist/index.js"]
