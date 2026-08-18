"""Baseline: an empty schema.

The api owns its schema through migrations from its first boot, so the chain
starts here rather than at whatever the first table happens to be. This
revision creates nothing; it gives the database a schema version, and every
later migration a parent.

Revision ID: 0001_baseline
Revises:
"""

from collections.abc import Sequence

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
