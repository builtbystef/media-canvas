"""Workspace API keys: Owner-minted secrets for the generation surface.

Revision ID: 0009_api_keys
Revises: 0008_invites
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_api_keys"
down_revision: str | None = "0008_invites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("prefix", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash"),
    )
    op.create_index(
        op.f("ix_api_keys_workspace_id"), "api_keys", ["workspace_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_api_keys_workspace_id"), table_name="api_keys")
    op.drop_table("api_keys")
