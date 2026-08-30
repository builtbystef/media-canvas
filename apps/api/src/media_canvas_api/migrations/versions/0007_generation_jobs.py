"""Generation Jobs and their Rows.

Revision ID: 0007_generation_jobs
Revises: 0006_image_assets
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_generation_jobs"
down_revision: str | None = "0006_image_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JOB_STATE = sa.Enum(
    "queued", "rendering", "completed", "failed", "canceled", name="job_state"
)
ROW_STATUS = sa.Enum(
    "queued", "rendering", "succeeded", "failed", "skipped", name="row_status"
)


def upgrade() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column(
            "template_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "output_format", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("state", JOB_STATE, nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "template_id",
            "idempotency_key",
            name="uq_generation_jobs_template_idempotency",
        ),
    )
    op.create_index(
        op.f("ix_generation_jobs_workspace_id"),
        "generation_jobs",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_generation_jobs_template_id"),
        "generation_jobs",
        ["template_id"],
        unique=False,
    )
    op.create_table(
        "generation_rows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", ROW_STATUS, nullable=False),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("output_key", sa.String(length=500), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["generation_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "name", name="uq_generation_rows_job_name"),
        sa.UniqueConstraint("job_id", "row_index", name="uq_generation_rows_job_index"),
    )
    op.create_index(
        op.f("ix_generation_rows_job_id"),
        "generation_rows",
        ["job_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_generation_rows_job_id"), table_name="generation_rows")
    op.drop_table("generation_rows")
    op.drop_index(op.f("ix_generation_jobs_template_id"), table_name="generation_jobs")
    op.drop_index(op.f("ix_generation_jobs_workspace_id"), table_name="generation_jobs")
    op.drop_table("generation_jobs")
    ROW_STATUS.drop(op.get_bind())
    JOB_STATE.drop(op.get_bind())
