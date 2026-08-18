"""Documents: one table for designs and templates alike.

Revision ID: 0004_documents
Revises: 0003_workspaces
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_documents"
down_revision: str | None = "0003_workspaces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KIND = sa.Enum("design", "template", name="document_kind")


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("kind", KIND, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("document", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("promoted_from_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        # Lineage, cleared instead of followed: deleting the design a template
        # was promoted from leaves that template standing.
        sa.ForeignKeyConstraint(
            ["promoted_from_id"], ["documents.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Every list is one Workspace's, and deleting a Workspace finds its
    # documents through this too.
    op.create_index(
        op.f("ix_documents_workspace_id"), "documents", ["workspace_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_documents_workspace_id"), table_name="documents")
    op.drop_table("documents")
    KIND.drop(op.get_bind())
