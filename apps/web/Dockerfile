FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ipeasy/db generate
RUN pnpm --filter @ipeasy/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/serve.mjs ./serve.mjs
EXPOSE 8080
CMD ["node", "serve.mjs"]
