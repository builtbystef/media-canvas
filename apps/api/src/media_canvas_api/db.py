"""The api's connection to Postgres, and the base its tables hang off."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from media_canvas_api.settings import Settings


class Base(DeclarativeBase):
    """The declarative base of every table the api owns (ADR-0005).

    Its metadata is what Alembic's autogenerate compares the database against,
    so a model that is not reachable from here is invisible to migrations.
    """


def create_database_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(settings.database_url, pool_pre_ping=True)
