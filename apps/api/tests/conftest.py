"""Test fixtures: a real Postgres, and a clean database for every test.

The tests talk to the Postgres the compose stack starts. They never touch the
development database — the name is overridden here, before anything reads the
settings.
"""

import os
from collections.abc import Iterator
from contextlib import contextmanager

os.environ["POSTGRES_DB"] = "media_canvas_test"

import pytest
from fastapi.testclient import TestClient
from media_canvas_api.main import app
from media_canvas_api.settings import Settings, get_settings
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.exc import OperationalError

UNREACHABLE = (
    "Postgres is not reachable at {host}:{port}. The tests run against the "
    "compose stack's database: `docker compose up -d`."
)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return get_settings()


@pytest.fixture(scope="session", autouse=True)
def test_database(settings: Settings) -> None:
    """Recreate the test database once, before anything connects to it."""
    recreate_database(settings, settings.postgres_db)


@pytest.fixture(autouse=True)
def clean_database(test_database: None, settings: Settings) -> Iterator[None]:
    """Leave every test the empty tables the migrations describe."""
    yield
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        truncate_all_tables(connection)
    engine.dispose()


@pytest.fixture
def unmigrated_database(test_database: None, settings: Settings) -> None:
    """The database as a fresh deployment finds it: no tables, no version."""
    recreate_database(settings, settings.postgres_db)


@pytest.fixture
def client() -> Iterator[TestClient]:
    """The api, started as it starts in production — migrations included."""
    with TestClient(app) as started:
        yield started


@pytest.fixture
def empty_database(settings: Settings) -> Iterator[Engine]:
    """A database of its own, with nothing in it — not even a schema version."""
    name = f"{settings.postgres_db}_empty"
    recreate_database(settings, name)
    engine = create_engine(settings.database_url.set(database=name))
    yield engine
    engine.dispose()
    drop_database(settings, name)


def recreate_database(settings: Settings, name: str) -> None:
    with maintenance_connection(settings) as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{name}"'))


def drop_database(settings: Settings, name: str) -> None:
    with maintenance_connection(settings) as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


@contextmanager
def maintenance_connection(settings: Settings) -> Iterator[Connection]:
    """A connection to the server itself, outside any of its databases."""
    engine = create_engine(
        settings.database_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with engine.connect() as connection:
            yield connection
    except OperationalError as unreachable:
        raise pytest.UsageError(
            UNREACHABLE.format(host=settings.postgres_host, port=settings.postgres_port)
        ) from unreachable
    finally:
        engine.dispose()


def truncate_all_tables(connection: Connection) -> None:
    names = connection.execute(
        text(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        )
    ).scalars()
    tables = ", ".join(f'"{name}"' for name in names)
    if tables:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
