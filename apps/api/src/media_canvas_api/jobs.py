"""Job submission, polling, and output delivery.

A batch of Rows meets a Template and becomes a Generation Job — or the whole
batch is refused and nothing exists. Validation is the worker's (ADR-0003);
this module copies the Template, records the Rows, answers with the Job, and
enqueues one identifiers-only task per Row (ADR-0004). Finished files leave
through here too: the api streams them from its own storage, never a URL.
Cancel stops work that has not started; delete is the only way a Job and its
outputs leave.
"""

import csv
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime
from io import StringIO
from re import compile as regexp
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, Request, params
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from media_canvas_api.access import (
    Database,
    Now,
    Storage,
    Viewing,
    WorkerService,
    WorkQueue,
    caller_in,
    refuse_unless,
)
from media_canvas_api.models import (
    Document,
    DocumentKind,
    GenerationJob,
    GenerationRow,
    JobState,
    Role,
    RowStatus,
)
from media_canvas_api.storage import serve, serve_archive
from media_canvas_api.worker import NamedProblem, RowError, Worker

router = APIRouter(prefix="/api/v1", tags=["jobs"])

UNREACHABLE_TEMPLATE = "No such template."
UNREACHABLE_JOB = "No such job."
UNREACHABLE_FILE = "No such file."
NOT_A_TEMPLATE = "Only a template accepts a batch."

CONTENT_TYPES = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "pdf": "application/pdf",
}

ROW_NAME = regexp(r"^[A-Za-z0-9._-]{1,128}$")

NAME_CHARSET = (
    "A row name may only contain letters, digits, dot, dash and underscore, "
    "and may be at most 128 characters."
)
UNKNOWN_COLUMN = "'{name}' is not a declared Variable."
EMPTY_CSV = "A CSV submission needs at least one data row."
MISSING_FORMAT = "A CSV submission needs a format."
CONTRADICTORY_FORMAT = "The output format contradicts itself."


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

_output = TypeAdapter[OutputFormat](OutputFormat)


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
        request: Request,
    ) -> Document:
        document = await database.get(Document, template_id)
        if document is None:
            raise HTTPException(404, UNREACHABLE_TEMPLATE)
        membership = await caller_in(request, database, document.workspace_id)
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
        request: Request,
    ) -> GenerationJob:
        job = await database.get(GenerationJob, job_id)
        if job is None:
            raise HTTPException(404, UNREACHABLE_JOB)
        membership = await caller_in(request, database, job.workspace_id)
        if membership is None:
            raise HTTPException(404, UNREACHABLE_JOB)
        refuse_unless(membership, role)
        return job

    return Depends(resolve)


EditableTemplate = Annotated[Document, holding_template(Role.editor)]
ReadableJob = Annotated[GenerationJob, holding_job(Role.viewer)]
EditableJob = Annotated[GenerationJob, holding_job(Role.editor)]


@router.post(
    "/templates/{templateId}/jobs",
    status_code=201,
    operation_id="createJob",
    response_model=JobView,
    response_model_exclude_none=True,
    responses={422: {"model": BatchRefusal}},
    openapi_extra={
        "parameters": [
            {
                "name": "format",
                "in": "query",
                "required": False,
                "schema": {"type": "string", "enum": ["png", "jpeg", "pdf"]},
            },
            {
                "name": "scale",
                "in": "query",
                "required": False,
                "schema": {"type": "integer", "enum": [1, 2, 3]},
            },
            {
                "name": "quality",
                "in": "query",
                "required": False,
                "schema": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            {
                "name": "idempotencyKey",
                "in": "query",
                "required": False,
                "schema": {"type": "string"},
            },
        ],
        "requestBody": {
            "content": {
                "text/csv": {"schema": {"type": "string"}},
            },
        },
    },
)
async def create_job(
    request: Request,
    template: EditableTemplate,
    database: Database,
    worker: WorkerService,
    work: WorkQueue,
    clock: Now,
    body: SubmitJob | str,
) -> JobView | JSONResponse:
    """Submit a batch against this Template, or return the Job a repeated
    idempotency key already created.

    A text/csv body is the same channel: format and idempotency key travel
    as query parameters, cells stay strings, and the worker types them.
    """
    if _csv_request(request):
        output, idempotency_key = output_from_query(request.query_params)
        text = body if isinstance(body, str) else ""
        rows, header_errors = rows_from_csv(
            text.removeprefix("\ufeff"), template.document
        )
        if header_errors:
            return refused(header_errors)
        return await accept_batch(
            rows=rows,
            output=output,
            idempotency_key=idempotency_key,
            cells=True,
            template=template,
            database=database,
            worker=worker,
            work=work,
            clock=clock,
        )
    if isinstance(body, str):
        raise RequestValidationError(
            [
                {
                    "type": "model_attributes_type",
                    "loc": ("body",),
                    "msg": (
                        "Input should be a valid dictionary or object "
                        "to extract fields from"
                    ),
                    "input": body,
                }
            ]
        )
    return await accept_batch(
        rows=body.rows,
        output=body.output,
        idempotency_key=body.idempotency_key,
        cells=False,
        template=template,
        database=database,
        worker=worker,
        work=work,
        clock=clock,
    )


async def accept_batch(
    *,
    rows: list[dict[str, Any]],
    output: OutputFormat,
    idempotency_key: str | None,
    cells: bool,
    template: Document,
    database: Database,
    worker: Worker,
    work: WorkQueue,
    clock: Now,
) -> JobView | JSONResponse:
    """Validate, snapshot, and store — or refuse the whole batch."""
    if idempotency_key:
        existing = await job_for_key(database, template.id, idempotency_key)
        if existing is not None:
            return JSONResponse(
                status_code=200,
                content=_dumped(await view_of(database, existing)),
            )

    named, name_errors = names_for(rows)
    if name_errors:
        return refused(name_errors)

    values = [row_values for _, _, row_values in named]
    judged = await worker.validate_batch(
        str(template.workspace_id), template.document, values, cells=cells
    )
    if judged.errors or judged.template_errors:
        return refused(judged.errors, judged.template_errors)

    stored_values = judged.rows if cells and judged.rows is not None else values
    now = clock()
    job = GenerationJob(
        id=uuid4(),
        workspace_id=template.workspace_id,
        template_id=template.id,
        template_snapshot=deepcopy(template.document),
        output_format=output.model_dump(),
        state=JobState.queued,
        idempotency_key=idempotency_key,
        created_at=now,
        updated_at=now,
    )
    database.add(job)
    stored_rows = [
        GenerationRow(
            job_id=job.id,
            row_index=index,
            name=name,
            values=typed,
            status=RowStatus.queued,
            attempts=0,
        )
        for (index, name, _), typed in zip(named, stored_values, strict=True)
    ]
    database.add_all(stored_rows)
    try:
        await database.commit()
    except IntegrityError:
        await database.rollback()
        if idempotency_key is None:
            raise
        existing = await job_for_key(database, template.id, idempotency_key)
        if existing is None:
            raise
        return JSONResponse(
            status_code=200,
            content=_dumped(await view_of(database, existing)),
        )
    await work.enqueue([(job.id, row.id) for row in stored_rows])
    return view_of_rows(job, stored_rows)


def _csv_request(request: Request) -> bool:
    content_type = request.headers.get("content-type", "")
    return content_type.split(";", 1)[0].strip().lower() == "text/csv"


def output_from_query(params: Mapping[str, str]) -> tuple[OutputFormat, str | None]:
    """The format a CSV submission carries in query parameters.

    A missing or self-contradictory format is refused before any cell is
    read: png takes a scale, jpeg an optional quality, pdf neither.
    """
    fmt = params.get("format")
    if fmt is None:
        raise HTTPException(422, MISSING_FORMAT)
    has_scale = "scale" in params
    has_quality = "quality" in params
    if (
        (fmt == "png" and has_quality)
        or (fmt == "jpeg" and has_scale)
        or (fmt == "pdf" and (has_scale or has_quality))
    ):
        raise HTTPException(422, CONTRADICTORY_FORMAT)
    payload: dict[str, Any] = {"format": fmt}
    try:
        if has_scale:
            payload["scale"] = int(params["scale"])
        if has_quality:
            payload["quality"] = int(params["quality"])
        return _output.validate_python(payload), params.get("idempotencyKey")
    except (TypeError, ValueError, ValidationError) as exc:
        raise HTTPException(422, CONTRADICTORY_FORMAT) from exc


def declared_variable_names(document: dict[str, Any]) -> set[str]:
    """The Variable names the Template declares.

    The header check is this module's: core ignores unknown keys, so a CSV
    column that names nothing declared would otherwise be stored and silently
    dropped. Only names are read; types stay the worker's (ADR-0003).
    """
    declared = document.get("variables")
    if not isinstance(declared, list):
        return set()
    return {
        item["name"]
        for item in declared
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }


def rows_from_csv(
    text: str, document: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[RowError]]:
    """Parse CSV text into string cells, or the reasons the file is refused.

    Empty cells are omitted, so a default applies and an explicit empty
    string stays reachable only through JSON. Row indexes count data rows
    from zero; the header is not one of them.
    """
    reader = csv.reader(StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return [], [RowError(row_index=0, message=EMPTY_CSV)]

    declared = declared_variable_names(document)
    unknown = [
        RowError(
            row_index=0,
            variable=column,
            message=UNKNOWN_COLUMN.format(name=column),
        )
        for column in header
        if column != "_name" and column not in declared
    ]

    rows: list[dict[str, Any]] = []
    for cells in reader:
        row: dict[str, Any] = {}
        for name, cell in zip(header, cells, strict=False):
            if cell == "":
                continue
            row[name] = cell
        rows.append(row)

    if not rows:
        return [], [RowError(row_index=0, message=EMPTY_CSV)]
    if unknown:
        return [], unknown
    return rows, []


@router.get("/jobs/{jobId}", operation_id="getJob", response_model_exclude_none=True)
async def get_job(job: ReadableJob, database: Database) -> JobView:
    """One Job, with every Row and the counts taken from those Rows."""
    return await view_of(database, job)


@router.post(
    "/jobs/{jobId}/cancel",
    operation_id="cancelJob",
    response_model_exclude_none=True,
)
async def cancel_job(job: EditableJob, database: Database, clock: Now) -> JobView:
    """Stop work that has not started. Finished files stay; unstarted Rows skip."""
    locked = await database.get(GenerationJob, job.id, with_for_update=True)
    if locked is None:
        raise HTTPException(404, UNREACHABLE_JOB)
    if locked.state not in {JobState.queued, JobState.rendering}:
        return await view_of(database, locked)
    now = clock()
    locked.state = JobState.canceled
    locked.canceled_at = now
    locked.updated_at = now
    rows = (
        await database.scalars(
            select(GenerationRow)
            .where(GenerationRow.job_id == locked.id)
            .order_by(GenerationRow.row_index)
            .with_for_update()
        )
    ).all()
    for row in rows:
        if row.status in {RowStatus.queued, RowStatus.rendering}:
            row.status = RowStatus.skipped
            row.finished_at = now
    await database.commit()
    return view_of_rows(locked, rows)


@router.delete("/jobs/{jobId}", status_code=204, operation_id="deleteJob")
async def delete_job(job: EditableJob, database: Database, storage: Storage) -> None:
    """Remove the Job, its Rows, and every stored object under its prefix."""
    prefix = f"{job.workspace_id}/jobs/{job.id}/"
    await database.delete(job)
    await database.commit()
    await run_in_threadpool(storage.outputs.delete_prefix, prefix)


@router.get(
    "/jobs/{jobId}/outputs/{name}.{ext}",
    operation_id="getJobOutput",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {
                "image/png": {"schema": {"type": "string", "format": "binary"}},
                "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                "application/pdf": {"schema": {"type": "string", "format": "binary"}},
            }
        }
    },
)
async def get_output(
    job: ReadableJob,
    name: str,
    ext: str,
    database: Database,
    storage: Storage,
) -> StreamingResponse:
    """One succeeded Row's file, streamed from the api's own storage."""
    row = await output_row(database, job, name, ext)
    if row is None or row.output_key is None:
        raise HTTPException(404, UNREACHABLE_FILE)
    return serve(
        storage.outputs, row.output_key, media_type=content_type_of(job.output_format)
    )


@router.get(
    "/jobs/{jobId}/outputs.zip",
    operation_id="getJobArchive",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {
                "application/zip": {"schema": {"type": "string", "format": "binary"}}
            }
        }
    },
)
async def get_archive(
    job: ReadableJob, database: Database, storage: Storage
) -> StreamingResponse:
    """Every succeeded Row, as one zip, streamed rather than assembled."""
    rows = (
        await database.scalars(
            select(GenerationRow)
            .where(
                GenerationRow.job_id == job.id,
                GenerationRow.status == RowStatus.succeeded,
            )
            .order_by(GenerationRow.row_index)
        )
    ).all()
    extension = extension_of(job.output_format)
    return serve_archive(
        storage.outputs,
        [
            (f"{row.name}.{extension}", row.output_key)
            for row in rows
            if row.output_key is not None
        ],
    )


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
        rows=[row_view(job, row) for row in rows],
    )


def row_view(job: GenerationJob, row: GenerationRow) -> RowView:
    return RowView(
        index=row.row_index,
        name=row.name,
        status=row.status,
        error=NamedProblem.model_validate(row.error) if row.error else None,
        url=output_address(job, row),
    )


def output_address(job: GenerationJob, row: GenerationRow) -> str | None:
    """The one address a succeeded Row's file is at, derived from the Job
    and the Row's name. It does not change afterwards."""
    if row.status is not RowStatus.succeeded:
        return None
    return f"/api/v1/jobs/{job.id}/outputs/{row.name}.{extension_of(job.output_format)}"


def extension_of(output: dict[str, Any]) -> str:
    return str(output["format"])


def content_type_of(output: dict[str, Any]) -> str:
    return CONTENT_TYPES[extension_of(output)]


async def output_row(
    database: Database, job: GenerationJob, name: str, ext: str
) -> GenerationRow | None:
    """The succeeded Row this address names, or none.

    A failed, skipped, unfinished, or differently-extended name is the same
    answer as a name the Job never had: not found.
    """
    if ext != extension_of(job.output_format):
        return None
    row = await database.scalar(
        select(GenerationRow).where(
            GenerationRow.job_id == job.id, GenerationRow.name == name
        )
    )
    if row is None or row.status is not RowStatus.succeeded:
        return None
    return row


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
