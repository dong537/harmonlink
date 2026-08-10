FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/api... build

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/main"]
