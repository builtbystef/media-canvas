# The pinned render worker image (issue 6sfpv3, ADR-0002).
#
# Everything that can move a pixel is fixed in here: the base image by digest,
# the Playwright package together with the browser build paired with it, the
# font set and the whole font configuration, and the page's viewport, device
# scale factor, locale, timezone and color scheme. A render outside this image
# is not the render a golden baseline (issue 6bqdxe) was taken from, so
# apps/worker/environment.json writes the tuple down and the checks in
# apps/worker/src/checks compare the running environment against it.
#
# Build it from the repository root:
#
#   pnpm --filter worker run image:build
#
FROM node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

# Chromium reads the timezone and the locale from the process environment;
# the browser context pins both again (src/environment.ts), so neither the
# host's clock nor its locale reaches a page even when someone overrides
# these.
ENV TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    # Browser builds outside any home directory: the image owns them.
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

WORKDIR /srv/media-canvas

# The manifests first, so that a source change does not reinstall the world.
# The packages the worker never imports still ship their package.json: a
# filtered install checks every manifest the lockfile names.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/core/package.json packages/core/
COPY packages/fonts/package.json packages/fonts/

# `worker...` is the worker plus the workspace packages it depends on. Dev
# dependencies come with it on purpose: the smoke, environment and golden
# checks run inside this image, never beside it.
RUN corepack enable pnpm \
  && pnpm install --frozen-lockfile --filter worker... \
  # The package cache is a third of the image and nothing reads it after
  # the install: what node_modules holds are hardlinks to files the store
  # keeps alive on its own.
  && rm -rf /root/.cache/pnpm /root/.local/share/pnpm/store

# fontconfig gives the font check its fc-list; install-deps installs the
# shared libraries this exact browser build links against. Both browser
# flavors of the pinned Playwright are downloaded here — the render path
# launches full Chromium (channel `chromium`, new headless), and the headless
# shell is present solely so the cross-flavor parity fixture (issue 6bqdxe)
# can run both flavors inside one pinned environment.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig \
  && pnpm --filter worker exec playwright-core install-deps chromium \
  && pnpm --filter worker exec playwright-core install chromium chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/*

COPY packages/core packages/core
COPY packages/fonts packages/fonts
COPY apps/worker apps/worker

# The font configuration is the bundled set and nothing else: the distro's own
# faces and its /etc/fonts/conf.d cascade of aliases and substitutions both go,
# and the replacement config names one directory (fonts.conf).
RUN rm -rf /usr/share/fonts /usr/local/share/fonts /root/.fonts \
    /root/.local/share/fonts /etc/fonts/conf.d \
  && cp apps/worker/fonts.conf /etc/fonts/fonts.conf

# Renders happen as a normal user: a page draws content that came in from
# outside, and Chromium's own sandbox refuses to run as root.
RUN useradd --create-home --uid 10001 render \
  && chown -R render:render /home/render /var/cache/fontconfig
USER render

# Last, so that no later layer can invalidate what it wrote: the font cache
# belongs to the user that renders, and a container that had to rebuild it
# would scan the set on every launch.
RUN fc-cache --force

CMD ["node", "apps/worker/src/index.ts"]
