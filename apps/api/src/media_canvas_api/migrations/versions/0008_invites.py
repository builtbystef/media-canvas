"""Workspace Invites: an Owner's emailed offer of Membership.

Revision ID: 0008_invites
Revises: 0007_generation_jobs
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_invites"
down_revision: str | None = "0007_generation_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The type already exists: 0003_workspaces created it, and this column
# names the same three Roles.
ROLE = sa.Enum("viewer", "editor", "owner", name="role", create_type=False)


def upgrade() -> None:
    op.create_table(
        "invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", ROLE, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("workspace_id", "email", name="uq_invites_workspace_email"),
    )
    op.create_index(
        op.f("ix_invites_workspace_id"), "invites", ["workspace_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invites_workspace_id"), table_name="invites")
    op.drop_table("invites")
