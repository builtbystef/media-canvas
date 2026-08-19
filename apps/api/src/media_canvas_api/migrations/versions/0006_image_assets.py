"""Image Assets: one row per image a Workspace holds, as it is stored.

Revision ID: 0006_image_assets
Revises: 0005_font_assets
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_image_assets"
down_revision: str | None = "0005_font_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "image_assets",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        # The SHA-256 of the stored, normalized bytes — never of what was
        # uploaded — so that the id names what the worker later verifies.
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=200), nullable=False),
        # What inspection proved the bytes to be, not what the upload said.
        sa.Column("content_type", sa.String(length=100), nullable=False),
        # The upright numbers: a rotated photo is stored the way it is meant
        # to be seen, and there is no other size to record.
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        # Identity is the Workspace together with the hash, matching Font
        # Assets: the same picture in two Workspaces is two assets.
        sa.PrimaryKeyConstraint("workspace_id", "id"),
    )


def downgrade() -> None:
    op.drop_table("image_assets")
