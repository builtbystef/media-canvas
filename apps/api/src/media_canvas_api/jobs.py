"""Job submission and polling.

A batch of Rows meets a Template and becomes a Generation Job — or the whole
batch is refused and nothing exists. Validation is the worker's (ADR-0003);
this module copies the Template, records the Rows, and answers with the Job.
The queue is not this slice: a submitted Job sits queued until 4dpprd
enqueues it.
"""

from collections.abc import Sequence
from copy import deepcopy
from datetime import datetime
from re import compile as regexp
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, params
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from media_canvas_api.access import (
    CurrentSession,
    Database,
    Now,
    Viewing,
    WorkerService,
    refuse_unless,
)
from media_canvas_api.memberships import membership_in
from media_canvas_api.models import (
    Document,
    DocumentKind,
    GenerationJob,
    GenerationRow,
    JobState,
    Role,
    RowStatus,
)
from media_canvas_api.worker import BatchValidation, NamedProblem, RowError, Worker

router = APIRouter(prefix="/api/v1", tags=["jobs"])

# The same answer for a Template that does not exist and for one in a
# Workspace the caller is not in: a stranger learns nothing from asking.
UNREACHABLE_TEMPLATE = "No such template."
UNREACHABLE_JOB = "No such job."
NOT_A_TEMPLATE = "Only a template accepts a batch."

# `_name`: letters, digits, dot, dash, underscore; at most 128 characters.
ROW_NAME = regexp(r"^[A-Za-z0-9._-]{1,128}$")

NAME_CHARSET = (
    "A row name may only contain letters, digits, dot, dash and underscore, "
    "and may be at most 128 characters."
)


class JobPayload(BaseModel):
    """The camelCase a client reads, from the snake_case the table holds."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PngOutput(BaseModel):
    format: Literal["png"]
    scale: Literal[1, 2, 3]


class JpegOutput(BaseModel):
    format: Literal["jpeg"]
    quality: int = Field(default=90, ge=1, le=100)


class PdfOutput(BaseModel):
    format: Literal["pdf"]


type OutputFormat = Annotated[
    PngOutput | JpegOutput | PdfOutput, Field(discriminator="format")
]


class Progress(JobPayload):
    queued: int
    rendering: int
    succeeded: int
    failed: int
    skipped: int


class RowView(JobPayload):
    """One Row as polling shows it. `error` and `url` stay off the wire
    until the Row has one."""

    index: int
    name: str
    status: RowStatus
    error: NamedProblem | None = None
    url: str | None = None


class JobView(JobPayload):
    id: UUID
    template_id: UUID
    state: JobState
    output: OutputFormat
    created_at: datetime
    progress: Progress
    rows: list[RowView]


class JobSummary(JobPayload):
    """A Job as the Workspace list shows it: no per-Row detail, and the
    Template's name joined in."""

    id: UUID
    template_id: UUID
    template_name: str | None
    state: JobState
    output: OutputFormat
    created_at: datetime
    progress: Progress


class SubmitJob(JobPayload):
    rows: list[dict[str, Any]] = Field(min_length=1)
    output: OutputFormat
    idempotency_key: str | None = None


class BatchRefusal(JobPayload):
    """What a refused batch answers with: one error per problem."""

    errors: list[RowError]
    template_errors: list[NamedProblem]


def holding_template(role: Role) -> params.Depends:
    """The gate every Template-addressed route declares.

    It resolves the document the path names together with the caller's rights
    over it. Not being in the Workspace answers exactly what a missing
    Template answers.
    """

    async def resolve(
        template_id: Annotated[UUID, Path(alias="templateId")],
        database: Database,
        signed_in: CurrentSession,
    ) -> Document:
        document = await database.get(Document, template_id)
        if document is None:
            raise HTTPException(404, UNREACHABLE_TEMPLATE)
        membership = await membership_in(
            database, document.workspace_id, signed_in.user.id
        )
        if membership is None:
            raise HTTPException(404, UNREACHABLE_TEMPLATE)
        refuse_unless(membership, role)
        if document.kind is not DocumentKind.template:
            raise HTTPException(422, NOT_A_TEMPLATE)
        return document

    return Depends(resolve)


def holding_job(role: Role) -> params.Depends:
    """The gate every Job item route declares.

    A missing Job and a Workspace the caller is not in answer identically.
    """

    async def resolve(
        job_id: Annotated[UUID, Path(alias="jobId")],
        database: Database,
        signed_in: CurrentSession,
    ) -> GenerationJob:
        job = await database.get(GenerationJob, job_id)
        if job is None:
            raise HTTPException(404, UNREACHABLE_JOB)
        membership = await membership_in(database, job.workspace_id, signed_in.user.id)
        if membership is None:
            raise HTTPException(404, UNREACHABLE_JOB)
        refuse_unless(membership, role)
        return job

    return Depends(resolve)


EditableTemplate = Annotated[Document, holding_template(Role.editor)]
ReadableJob = Annotated[GenerationJob, holding_job(Role.viewer)]


@router.post(
    "/templates/{templateId}/jobs",
    status_code=201,
    operation_id="createJob",
    response_model=JobView,
    response_model_exclude_none=True,
    responses={422: {"model": BatchRefusal}},
)
async def create_job(
    body: SubmitJob,
    template: EditableTemplate,
    database: Database,
    worker: WorkerService,
    clock: Now,
) -> JobView | JSONResponse:
    """Submit a batch against this Template, or return the Job a repeated
    idempotency key already created."""
    if body.idempotency_key:
        existing = await job_for_key(database, template.id, body.idempotency_key)
        if existing is not None:
            return JSONResponse(
                status_code=200,
                content=_dumped(await view_of(database, existing)),
            )

    named, name_errors = names_for(body.rows)
    if name_errors:
        return refused(name_errors)

    judged = await validate_with(worker, template, [values for _, _, values in named])
    if judged.errors or judged.template_errors:
        return refused(judged.errors, judged.template_errors)

    now = clock()
    job = GenerationJob(
        id=uuid4(),
        workspace_id=template.workspace_id,
        template_id=template.id,
        template_snapshot=deepcopy(template.document),
        output_format=body.output.model_dump(),
        state=JobState.queued,
        idempotency_key=body.idempotency_key,
        created_at=now,
        updated_at=now,
    )
    database.add(job)
    stored_rows = [
        GenerationRow(
            job_id=job.id,
            row_index=index,
            name=name,
            values=values,
            status=RowStatus.queued,
            attempts=0,
        )
        for index, name, values in named
    ]
    database.add_all(stored_rows)
    try:
        await database.commit()
    except IntegrityError:
        # Two submissions with the same key arrived together: the first
        # writer won, and this one is the retry that must not render twice.
        await database.rollback()
        if body.idempotency_key is None:
            raise
        existing = await job_for_key(database, template.id, body.idempotency_key)
        if existing is None:
            raise
        return JSONResponse(
            status_code=200,
            content=_dumped(await view_of(database, existing)),
        )
    return view_of_rows(job, stored_rows)


@router.get("/jobs/{jobId}", operation_id="getJob", response_model_exclude_none=True)
async def get_job(job: ReadableJob, database: Database) -> JobView:
    """One Job, with every Row and the counts taken from those Rows."""
    return await view_of(database, job)


@router.get("/workspaces/{workspaceId}/jobs", operation_id="listJobs")
async def list_jobs(membership: Viewing, database: Database) -> list[JobSummary]:
    """This Workspace's Jobs, newest first, without per-Row detail.

    The whole list, every time: a Workspace holds the batches one team
    submits, which is a number a person scrolls.
    """
    found = (
        await database.execute(
            select(GenerationJob, Document.name)
            .outerjoin(Document, Document.id == GenerationJob.template_id)
            .where(GenerationJob.workspace_id == membership.workspace_id)
            .order_by(GenerationJob.created_at.desc(), GenerationJob.id)
        )
    ).all()
    if not found:
        return []
    jobs = [job for job, _ in found]
    names = {job.id: name for job, name in found}
    progress = await progress_by_job(database, [job.id for job in jobs])
    return [
        JobSummary(
            id=job.id,
            template_id=job.template_id,
            template_name=names[job.id],
            state=job.state,
            output=job.output_format,
            created_at=job.created_at,
            progress=progress[job.id],
        )
        for job in jobs
    ]


async def job_for_key(
    database: Database, template_id: UUID, key: str
) -> GenerationJob | None:
    return await database.scalar(
        select(GenerationJob).where(
            GenerationJob.template_id == template_id,
            GenerationJob.idempotency_key == key,
        )
    )


async def validate_with(
    worker: Worker, template: Document, rows: list[dict[str, Any]]
) -> BatchValidation:
    return await worker.validate_batch(
        str(template.workspace_id), template.document, rows
    )


def names_for(
    rows: list[dict[str, Any]],
) -> tuple[list[tuple[int, str, dict[str, Any]]], list[RowError]]:
    """Assign each Row its name, or collect the reasons the batch is refused.

    Unnamed Rows take the zero-padded row index, padded to the width of the
    last index so the names sort in index order.
    """
    width = len(str(max(len(rows) - 1, 0)))
    assigned: list[tuple[int, str, dict[str, Any]]] = []
    errors: list[RowError] = []
    seen: dict[str, int] = {}
    for index, row in enumerate(rows):
        raw = row.get("_name")
        values = {key: value for key, value in row.items() if key != "_name"}
        if raw is None:
            name = str(index).zfill(width)
        elif isinstance(raw, str) and ROW_NAME.fullmatch(raw):
            name = raw
        else:
            errors.append(
                RowError(row_index=index, variable="_name", message=NAME_CHARSET)
            )
            continue
        if name in seen:
            errors.append(
                RowError(
                    row_index=index,
                    variable="_name",
                    message=f"The row name '{name}' is already used in this batch.",
                )
            )
            continue
        seen[name] = index
        assigned.append((index, name, values))
    return assigned, errors


def refused(
    errors: list[RowError], template_errors: list[NamedProblem] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=BatchRefusal(
            errors=errors, template_errors=template_errors or []
        ).model_dump(by_alias=True, exclude_none=True),
    )


async def view_of(database: Database, job: GenerationJob) -> JobView:
    rows = (
        await database.scalars(
            select(GenerationRow)
            .where(GenerationRow.job_id == job.id)
            .order_by(GenerationRow.row_index)
        )
    ).all()
    return view_of_rows(job, rows)


def view_of_rows(job: GenerationJob, rows: Sequence[GenerationRow]) -> JobView:
    return JobView(
        id=job.id,
        template_id=job.template_id,
        state=job.state,
        output=job.output_format,
        created_at=job.created_at,
        progress=progress_of(rows),
        rows=[row_view(row) for row in rows],
    )


def row_view(row: GenerationRow) -> RowView:
    return RowView(
        index=row.row_index,
        name=row.name,
        status=row.status,
        error=NamedProblem.model_validate(row.error) if row.error else None,
        url=None,
    )


def progress_of(rows: Sequence[GenerationRow]) -> Progress:
    counts = dict.fromkeys(RowStatus, 0)
    for row in rows:
        counts[row.status] += 1
    return Progress(
        queued=counts[RowStatus.queued],
        rendering=counts[RowStatus.rendering],
        succeeded=counts[RowStatus.succeeded],
        failed=counts[RowStatus.failed],
        skipped=counts[RowStatus.skipped],
    )


async def progress_by_job(
    database: Database, job_ids: list[UUID]
) -> dict[UUID, Progress]:
    """One GROUP BY over the Jobs' Rows, so the list's counts cannot drift."""
    tallied = (
        await database.execute(
            select(GenerationRow.job_id, GenerationRow.status, func.count())
            .where(GenerationRow.job_id.in_(job_ids))
            .group_by(GenerationRow.job_id, GenerationRow.status)
        )
    ).all()
    grouped: dict[UUID, dict[RowStatus, int]] = {
        job_id: dict.fromkeys(RowStatus, 0) for job_id in job_ids
    }
    for job_id, status, count in tallied:
        grouped[job_id][status] = count
    return {
        job_id: Progress(
            queued=counts[RowStatus.queued],
            rendering=counts[RowStatus.rendering],
            succeeded=counts[RowStatus.succeeded],
            failed=counts[RowStatus.failed],
            skipped=counts[RowStatus.skipped],
        )
        for job_id, counts in grouped.items()
    }


def _dumped(view: JobView) -> dict[str, Any]:
    return view.model_dump(mode="json", by_alias=True, exclude_none=True)
