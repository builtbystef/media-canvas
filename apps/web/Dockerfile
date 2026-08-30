FROM node:24.18.0-slim

WORKDIR /srv/media-canvas

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/fonts/package.json packages/fonts/package.json

RUN corepack enable pnpm \
  && pnpm install --frozen-lockfile --filter web...

COPY apps/web apps/web
COPY packages/api-client packages/api-client
COPY packages/core packages/core
COPY tsconfig tsconfig
RUN pnpm --filter web build \
  && rm -rf /root/.cache/pnpm /root/.local/share/pnpm/store

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start", "--hostname", "0.0.0.0"]
