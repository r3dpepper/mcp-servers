# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY servers/fetch/package.json servers/fetch/tsconfig.json ./
RUN npm install --omit=dev

# Runtime stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY servers/fetch/src ./src
COPY servers/fetch/dist ./dist
EXPOSE 3005
CMD ["node", "dist/index.js"]