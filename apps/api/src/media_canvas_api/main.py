import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine

from media_canvas_api.db import create_database_engine
from media_canvas_api.health import DatabaseHealth, check_database
from media_canvas_api.migrator import upgrade_to_head
from media_canvas_api.settings import get_settings

logger = logging.getLogger(__name__)

# One writer at a time: two api processes starting together would otherwise
# run the same pending migrations twice. Any constant identifies the lock.
MIGRATION_LOCK = 4_170_235_001


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Read the settings, migrate the database, and only then serve.

    A database that cannot be reached does not stop the api: it comes up and
    reports the problem at `/api/health`, which is the one route that answers
    without a working database. A migration that fails against a database that
    *is* reachable does stop it — that is a broken deployment, not a wait.
    """
    engine = create_database_engine(get_settings())
    app.state.engine = engine
    try:
        await migrate(engine)
    except OperationalError:
        logger.exception("the database is unreachable — starting without migrating")
    yield
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
