"""The Alembic environment.

The app passes its own connection through `config.attributes`; the command
line (`uv run alembic ...`) has none, so this opens one from the settings.
"""

from alembic import context
from media_canvas_api import models  # noqa: F401  — imported for its side effect
from media_canvas_api.db import Base
from media_canvas_api.settings import get_settings
from sqlalchemy import Connection, create_engine

# Autogenerate compares the database against this and nothing else, so a
# model whose module has not been imported by the time this runs is invisible
# to it — and the migration it needs is silently never written. That is what
# the `models` import above is for; every new table module joins it.
target_metadata = Base.metadata


def run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def main() -> None:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        run_migrations(connection)
        return
    engine = create_engine(get_settings().database_url)
    try:
        with engine.connect() as opened:
            run_migrations(opened)
    finally:
        engine.dispose()


main()
