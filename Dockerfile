FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node ipipd-apidoc.md ./
COPY --chown=node:node 操作说明手册.md ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
