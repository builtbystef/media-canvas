import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine

from media_canvas_api import (
    api_keys,
    auth,
    documents,
    fonts,
    images,
    internal,
    internal_jobs,
    invites,
    jobs,
    render,
    workspaces,
)
from media_canvas_api.access import AccessMiddleware, DevelopmentCors
from media_canvas_api.assets import AssetRefused, refusal_response
from media_canvas_api.clock import utc_now
from media_canvas_api.db import create_database_engine, create_session_factory
from media_canvas_api.health import DatabaseHealth, check_database
from media_canvas_api.mailer import build_mailer
from media_canvas_api.migrator import upgrade_to_head
from media_canvas_api.queue import RowQueue
from media_canvas_api.settings import get_settings
from media_canvas_api.storage import ObjectStore
from media_canvas_api.worker import HttpWorker

logger = logging.getLogger(__name__)

PACKAGE = __name__.split(".")[0]

MIGRATION_LOCK = 4_170_235_001


def configure_logging() -> None:
    """Give the api's own log lines somewhere to go.

    uvicorn configures its own loggers and leaves the root logger alone, so an
    application `logger.info(...)` finds no handler at all and falls back to
    the last-resort one, which drops anything below a warning. That is not a
    cosmetic loss: the console Mailer is the default driver, and the sign-in
    code it prints here is the whole of signing in on a machine with no mail
    service configured.

    Propagation is deliberately left on, so that anything watching the root —
    pytest's `caplog`, or a deployment that configures its own handlers — goes
    on seeing these records. Nothing is logged twice, because the last-resort
    handler is only reached when no handler was found anywhere.
    """
    package = logging.getLogger(PACKAGE)
    package.setLevel(logging.INFO)
    if not package.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
        package.addHandler(handler)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Read the settings, migrate the database, and only then serve.

    A database that cannot be reached does not stop the api: it comes up and
    reports the problem at `/api/health`, which is the one route that answers
    without a working database. A migration that fails against a database that
    *is* reachable does stop it — that is a broken deployment, not a wait. So
    does an object store that cannot be reached, which nothing reports.
    """
    configure_logging()
    settings = get_settings()
    app.state.settings = settings
    app.state.mailer = build_mailer(settings)
    engine = create_database_engine(settings)
    app.state.engine = engine
    app.state.sessions = create_session_factory(engine)
    app.state.clock = utc_now
    storage = ObjectStore(settings)
    storage.ensure_buckets()
    app.state.storage = storage
    app.state.worker = HttpWorker(settings)
    app.state.queue = RowQueue(settings)
    try:
        await migrate(engine)
    except OperationalError:
        logger.exception("the database is unreachable — starting without migrating")
    yield
    await app.state.queue.aclose()
    await engine.dispose()


async def migrate(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await connection.exec_driver_sql(f"SELECT pg_advisory_lock({MIGRATION_LOCK})")
        try:
            await connection.run_sync(upgrade_to_head)
        finally:
            await connection.exec_driver_sql(
                f"SELECT pg_advisory_unlock({MIGRATION_LOCK})"
            )


app = FastAPI(title="media-canvas-api", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(invites.router)
app.include_router(api_keys.router)
app.include_router(documents.router)
app.include_router(render.router)
app.include_router(fonts.router)
app.include_router(images.router)
app.include_router(jobs.router)
app.include_router(internal.router)
app.include_router(internal_jobs.router)
app.add_exception_handler(AssetRefused, refusal_response)
app.add_middleware(AccessMiddleware)
app.add_middleware(DevelopmentCors)


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    database: DatabaseHealth


class Greeting(BaseModel):
    message: str


@app.get("/api/health", operation_id="getHealth")
async def get_health(request: Request) -> Health:
    database = await check_database(request.app.state.engine)
    healthy = database.connected and database.schema_at_head
    return Health(status="ok" if healthy else "degraded", database=database)


@app.get("/api/hello/{name}", operation_id="getGreeting")
def get_greeting(name: str) -> Greeting:
    return Greeting(message=f"Hello, {name}!")
