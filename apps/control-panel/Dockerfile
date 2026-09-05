FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Build stage
FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/control-panel ./apps/control-panel

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the control-panel app
RUN pnpm --filter @ipeasy/control-panel build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built files and necessary dependencies
COPY --from=builder /app/apps/control-panel/dist ./dist
COPY --from=builder /app/apps/control-panel/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080

CMD ["node", "dist/index.js"]
