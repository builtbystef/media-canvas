# The FastAPI application image. Build from the repository root so the api can
# keep reading the shared bundled-font data from packages/fonts.
FROM ghcr.io/astral-sh/uv:0.12.3 AS uv
FROM python:3.14-slim

COPY --from=uv /uv /uvx /bin/
WORKDIR /srv/media-canvas

ENV PATH="/srv/media-canvas/.venv/bin:$PATH" \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Resolve the locked production environment before copying source, so an
# application edit does not reinstall third-party packages.
COPY pyproject.toml uv.lock ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
RUN uv sync --frozen --no-dev --package media-canvas-api --no-install-workspace

COPY apps/api apps/api
COPY packages/fonts packages/fonts
RUN uv sync --frozen --no-dev --package media-canvas-api

WORKDIR /srv/media-canvas/apps/api
CMD ["uvicorn", "media_canvas_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
