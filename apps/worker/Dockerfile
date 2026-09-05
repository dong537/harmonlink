FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/worker... build

WORKDIR /app/apps/worker

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
