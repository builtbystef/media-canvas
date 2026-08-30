"""Font Assets: one row per font file a Workspace holds.

Revision ID: 0005_font_assets
Revises: 0004_documents
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_font_assets"
down_revision: str | None = "0004_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FORMAT = sa.Enum("ttf", "otf", name="font_format")


def upgrade() -> None:
    op.create_table(
        "font_assets",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=200), nullable=False),
        sa.Column("format", FORMAT, nullable=False),
        sa.Column("family", sa.String(length=200), nullable=False),
        sa.Column("subfamily", sa.String(length=200), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column("italic", sa.Boolean(), nullable=False),
        sa.Column("postscript_name", sa.String(length=200), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("bundled", sa.Boolean(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workspace_id", "id"),
    )


def downgrade() -> None:
    op.drop_table("font_assets")
    FORMAT.drop(op.get_bind())
