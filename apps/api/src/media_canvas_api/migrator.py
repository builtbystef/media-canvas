"""Applying the api's migrations, and asking whether they have been applied.

Both take a synchronous connection: Alembic has no async interface, so the app
reaches these through `AsyncConnection.run_sync`.
"""

from pathlib import Path

from alembic.command import upgrade
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection

MIGRATIONS = Path(__file__).parent / "migrations"


def alembic_config(connection: Connection | None = None) -> Config:
    """The Alembic configuration, resolved from the installed package.

    `alembic.ini` says the same thing for the command line; this is what the
    app itself uses, so neither the working directory nor that file matters at
    runtime.
    """
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def upgrade_to_head(connection: Connection) -> None:
    """Apply every migration the database is missing, and commit them.

    Alembic leaves the transaction to whoever handed it the connection, so
    committing here is what makes the upgrade outlive the caller's block.
    """
    upgrade(alembic_config(connection), "head")
    connection.commit()


def is_at_head(connection: Connection) -> bool:
    """Whether the database carries exactly the revisions the code ships."""
    applied = MigrationContext.configure(connection).get_current_heads()
    return set(applied) == set(
        ScriptDirectory.from_config(alembic_config()).get_heads()
    )
