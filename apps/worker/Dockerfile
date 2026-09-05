FROM node:20-alpine

# Cache bust: 2026-09-06-04:47
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile --prod=false
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/worker... build

WORKDIR /app/apps/worker

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
