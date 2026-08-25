"""The three internal calls the render worker makes about a Job.

The queue carries only identifiers. Everything the worker needs to render —
the snapshot, the format, the Workspace, one Row's values — and everything it
has to say afterwards, crosses here. The credential is the shared internal
one; `AccessMiddleware` has already checked it.

Fetching a Row is also the queued-to-rendering transition: the Row is marked
rendering and stamped with its start time in the same request, and the first
such flip moves the Job. Reporting a result records the Row and, in the same
transaction, completes the Job when no Row of it remains queued or rendering.
"""

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy import func, select

from media_canvas_api.access import Database, Now
from media_canvas_api.jobs import JobPayload, OutputFormat
from media_canvas_api.models import GenerationJob, GenerationRow, JobState, RowStatus
from media_canvas_api.worker import NamedProblem

router = APIRouter(prefix="/internal", include_in_schema=False)

UNREACHABLE_JOB = "No such job."
UNREACHABLE_ROW = "No such row."

TERMINAL_JOB = frozenset({JobState.completed, JobState.failed, JobState.canceled})
TERMINAL_ROW = frozenset({RowStatus.succeeded, RowStatus.failed, RowStatus.skipped})


class InternalJob(JobPayload):
    template_snapshot: dict[str, Any]
    output: OutputFormat
    workspace_id: UUID


class InternalRow(JobPayload):
    values: dict[str, Any]
    name: str
    row_index: int


class RowResult(JobPayload):
    status: Literal["succeeded", "failed"]
    error: NamedProblem | None = None
    output_key: str | None = None


@router.get("/jobs/{jobId}")
async def fetch_job(
    job_id: Annotated[UUID, Path(alias="jobId")], database: Database
) -> InternalJob:
    """The snapshot, output format and Workspace, fetched once per Job."""
    job = await database.get(GenerationJob, job_id)
    if job is None:
        raise HTTPException(404, UNREACHABLE_JOB)
    return InternalJob(
        template_snapshot=job.template_snapshot,
        output=job.output_format,
        workspace_id=job.workspace_id,
    )


@router.get("/jobs/{jobId}/rows/{rowId}")
async def fetch_row(
    job_id: Annotated[UUID, Path(alias="jobId")],
    row_id: Annotated[UUID, Path(alias="rowId")],
    database: Database,
    clock: Now,
) -> InternalRow:
    """One Row's values. Fetching a queued Row starts it rendering."""
    job, row = await loaded(database, job_id, row_id)
    if row.status == RowStatus.queued and job.state not in TERMINAL_JOB:
        now = clock()
        row.status = RowStatus.rendering
        row.started_at = now
        if job.state == JobState.queued:
            job.state = JobState.rendering
            job.updated_at = now
        await database.commit()
    return InternalRow(values=row.values, name=row.name, row_index=row.row_index)


@router.post("/jobs/{jobId}/rows/{rowId}/result", status_code=204)
async def report_result(
    body: RowResult,
    job_id: Annotated[UUID, Path(alias="jobId")],
    row_id: Annotated[UUID, Path(alias="rowId")],
    database: Database,
    clock: Now,
) -> None:
    """Record the Row's outcome; complete the Job when nothing is outstanding."""
    job, row = await loaded(database, job_id, row_id)
    if row.status in TERMINAL_ROW:
        return
    now = clock()
    row.status = RowStatus(body.status)
    row.error = body.error.model_dump(exclude_none=True) if body.error else None
    row.output_key = body.output_key
    row.finished_at = now
    if job.state not in TERMINAL_JOB:
        await database.flush()
        outstanding = await database.scalar(
            select(func.count())
            .select_from(GenerationRow)
            .where(
                GenerationRow.job_id == job.id,
                GenerationRow.status.in_((RowStatus.queued, RowStatus.rendering)),
            )
        )
        if outstanding == 0:
            job.state = JobState.completed
            job.updated_at = now
    await database.commit()


async def loaded(
    database: Database, job_id: UUID, row_id: UUID
) -> tuple[GenerationJob, GenerationRow]:
    job = await database.get(GenerationJob, job_id)
    if job is None:
        raise HTTPException(404, UNREACHABLE_JOB)
    row = await database.get(GenerationRow, row_id)
    if row is None or row.job_id != job.id:
        raise HTTPException(404, UNREACHABLE_ROW)
    return job, row
