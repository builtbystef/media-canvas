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
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=200), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workspace_id", "id"),
    )


def downgrade() -> None:
    op.drop_table("image_assets")
