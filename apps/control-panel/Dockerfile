FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Build stage
FROM base AS builder
WORKDIR /app

# Copy workspace root files (go up from apps/control-panel)
COPY ../../pnpm-workspace.yaml ../../package.json ../../pnpm-lock.yaml ./
COPY ../../packages ../packages
COPY . ./apps/control-panel

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the control-panel app
WORKDIR /app/apps/control-panel
RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/control-panel/dist ./dist
COPY --from=builder /app/apps/control-panel/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080

CMD ["node", "dist/index.js"]
