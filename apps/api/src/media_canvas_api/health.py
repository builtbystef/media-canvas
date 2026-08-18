"""What the api can say about its own database.

Reporting, not gatekeeping: an unreachable database is an answer, not an
exception, so a deployer can ask a running service what is wrong with it.
"""

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from media_canvas_api.migrator import is_at_head


class DatabaseHealth(BaseModel):
    connected: bool
    schema_at_head: bool


async def check_database(engine: AsyncEngine) -> DatabaseHealth:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            at_head = await connection.run_sync(is_at_head)
    except SQLAlchemyError:
        return DatabaseHealth(connected=False, schema_at_head=False)
    return DatabaseHealth(connected=True, schema_at_head=at_head)
