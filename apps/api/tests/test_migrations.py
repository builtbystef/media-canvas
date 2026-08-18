from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from media_canvas_api.db import Base
from media_canvas_api.migrator import is_at_head, upgrade_to_head
from sqlalchemy import Engine


def test_migrating_an_empty_database_produces_the_schema_the_code_expects(
    empty_database: Engine,
) -> None:
    with empty_database.connect() as migrating:
        upgrade_to_head(migrating)

    with empty_database.connect() as reading:
        context = MigrationContext.configure(reading)

        assert compare_metadata(context, Base.metadata) == []


def test_an_empty_database_is_not_at_head_until_it_is_migrated(
    empty_database: Engine,
) -> None:
    with empty_database.connect() as before:
        assert is_at_head(before) is False

    with empty_database.connect() as migrating:
        upgrade_to_head(migrating)

    with empty_database.connect() as after:
        assert is_at_head(after) is True
