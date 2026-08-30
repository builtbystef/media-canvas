FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ENV TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

WORKDIR /srv/media-canvas

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/core/package.json packages/core/
COPY packages/fonts/package.json packages/fonts/

RUN corepack enable pnpm \
  && pnpm install --frozen-lockfile --filter worker... \
  && rm -rf /root/.cache/pnpm /root/.local/share/pnpm/store

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig \
  && pnpm --filter worker exec playwright-core install-deps chromium \
  && pnpm --filter worker exec playwright-core install chromium chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/*

COPY packages/core packages/core
COPY packages/fonts packages/fonts
COPY apps/worker apps/worker

RUN rm -rf /usr/share/fonts /usr/local/share/fonts /root/.fonts \
    /root/.local/share/fonts /etc/fonts/conf.d \
  && cp apps/worker/fonts.conf /etc/fonts/fonts.conf

RUN useradd --create-home --uid 10001 render \
  && chown -R render:render /home/render /var/cache/fontconfig
USER render

RUN fc-cache --force

CMD ["node", "apps/worker/src/index.ts"]
