"""The api's connection to Postgres, and the base its tables hang off."""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from media_canvas_api.settings import Settings


class Base(DeclarativeBase):
    """The declarative base of every table the api owns (ADR-0005).

    Its metadata is what Alembic's autogenerate compares the database against,
    so a model that is not reachable from here is invisible to migrations.
    """


def create_database_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(settings.database_url, pool_pre_ping=True)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Opens the database sessions each request works in.

    `expire_on_commit=False` keeps a committed row readable afterwards, so a
    handler can commit and then serialise what it wrote.
    """
    return async_sessionmaker(engine, expire_on_commit=False)
