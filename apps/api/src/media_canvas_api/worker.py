"""The one seam between the api and the render worker's internal service.

Document interpretation is TypeScript-only (ADR-0003), so everything the api
needs to know about the inside of a document — or of a font file — it asks the
worker. The credential is the shared internal one, and it never leaves the
stack.

Font inspection is deliberately the worker's: the parser that decides whether
a font may be stored at all is the same one that will later measure every line
of text drawn in it, so a file that is accepted here cannot fail at render
time for being unreadable.

`RecordingWorker` is the fake the tests drive; it lives here, beside the
contract it implements, so that every driver of this seam is in one file.
"""

from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

from media_canvas_api.settings import Settings

INSPECTION_TIMEOUT = 30.0

VALIDATION_TIMEOUT = 30.0

RENDER_TIMEOUT = 60.0


class WorkerUnreachable(RuntimeError):
    """The worker did not answer. Nothing the caller did causes this."""


class FontFacts(BaseModel):
    """What one readable font file says about itself.

    Everything but the format and the variable-font verdict is display
    metadata: the font picker groups faces by it, and nothing in the render
    path reads it.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    format: Literal["ttf", "otf"]
    family: str
    subfamily: str
    weight: int
    italic: bool
    post_script_name: str
    variable: bool


class ReadableFont(BaseModel):
    readable: Literal[True]
    font: FontFacts


class UnreadableFont(BaseModel):
    readable: Literal[False]
    problem: Literal["unsupported_format", "unparseable_font"]


type FontInspection = Annotated[
    ReadableFont | UnreadableFont, Field(discriminator="readable")
]

_inspection = TypeAdapter[FontInspection](FontInspection)


class NamedProblem(BaseModel):
    """One problem the worker found: a message, and the thing at fault."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    message: str
    variable: str | None = None
    element_id: str | None = None
    asset_id: str | None = None


class ValuesRefused(Exception):
    """The worker refused the values: named-Variable errors, no bytes."""

    def __init__(self, errors: list[NamedProblem]) -> None:
        self.errors = errors


@dataclass(frozen=True)
class RenderedFile:
    """What a successful render is: the bytes, and what they are."""

    body: bytes
    content_type: str


class RowError(NamedProblem):
    """A NamedProblem that also says which Row it is in."""

    row_index: int


class BatchValidation(BaseModel):
    """What POST /validate answers: Row problems, Template problems, and
    optionally the typed Rows of a cells:true request."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    errors: list[RowError]
    template_errors: list[NamedProblem]
    rows: list[dict[str, Any]] | None = None


_batch = TypeAdapter[BatchValidation](BatchValidation)


class RenderRefusal(BaseModel):
    """What POST /render answers when the values are wrong."""

    errors: list[NamedProblem]


_refusal = TypeAdapter[RenderRefusal](RenderRefusal)


@dataclass(frozen=True)
class ValidateCall:
    """One batch the api asked the worker to validate."""

    workspace_id: str
    template: dict[str, Any]
    rows: list[dict[str, Any]]
    cells: bool = False


@dataclass(frozen=True)
class RenderCall:
    """One document the api asked the worker to render."""

    workspace_id: str
    template: dict[str, Any]
    values: dict[str, Any]
    output: dict[str, Any]


class Worker(Protocol):
    """What the api asks the worker: inspect a font, validate a batch, or
    render one document into file bytes."""

    async def inspect_font(self, font: bytes) -> FontInspection:
        """Read a font file with the compiler's own parser."""
        ...

    async def validate_batch(
        self,
        workspace_id: str,
        template: dict[str, Any],
        rows: list[dict[str, Any]],
        *,
        cells: bool = False,
    ) -> BatchValidation:
        """Ask whether this Template and these Rows may become a Job."""
        ...

    async def render(
        self,
        workspace_id: str,
        template: dict[str, Any],
        values: dict[str, Any],
        output: dict[str, Any],
    ) -> RenderedFile:
        """Turn one document plus values into file bytes."""
        ...


class HttpWorker:
    """The real worker, over the internal HTTP service it exposes."""

    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.worker_internal_url
        self.token = settings.internal_api_token

    async def inspect_font(self, font: bytes) -> FontInspection:
        try:
            async with httpx.AsyncClient(timeout=INSPECTION_TIMEOUT) as calling:
                answer = await calling.post(
                    f"{self.base_url}/fonts/inspect",
                    content=font,
                    headers={
                        "authorization": f"Bearer {self.token}",
                        "content-type": "application/octet-stream",
                    },
                )
        except httpx.HTTPError as silent:
            raise WorkerUnreachable(
                f"the render worker did not answer at {self.base_url}"
            ) from silent
        if answer.status_code == 401:
            raise WorkerUnreachable(
                "the render worker refused the api's credential — the api and "
                "the worker must read the same INTERNAL_API_TOKEN"
            )
        if answer.is_error:
            raise WorkerUnreachable(
                f"the render worker answered {answer.status_code} at {self.base_url}"
            )
        return _inspection.validate_json(answer.content)

    async def validate_batch(
        self,
        workspace_id: str,
        template: dict[str, Any],
        rows: list[dict[str, Any]],
        *,
        cells: bool = False,
    ) -> BatchValidation:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "template": template,
            "rows": rows,
        }
        if cells:
            payload["cells"] = True
        try:
            async with httpx.AsyncClient(timeout=VALIDATION_TIMEOUT) as calling:
                answer = await calling.post(
                    f"{self.base_url}/validate",
                    json=payload,
                    headers={"authorization": f"Bearer {self.token}"},
                )
        except httpx.HTTPError as silent:
            raise WorkerUnreachable(
                f"the render worker did not answer at {self.base_url}"
            ) from silent
        if answer.status_code == 401:
            raise WorkerUnreachable(
                "the render worker refused the api's credential — the api and "
                "the worker must read the same INTERNAL_API_TOKEN"
            )
        if answer.is_error:
            raise WorkerUnreachable(
                f"the render worker answered {answer.status_code} at {self.base_url}"
            )
        return _batch.validate_json(answer.content)

    async def render(
        self,
        workspace_id: str,
        template: dict[str, Any],
        values: dict[str, Any],
        output: dict[str, Any],
    ) -> RenderedFile:
        payload: dict[str, Any] = {
            "workspaceId": workspace_id,
            "template": template,
            "values": values,
            "output": output,
        }
        try:
            async with httpx.AsyncClient(timeout=RENDER_TIMEOUT) as calling:
                answer = await calling.post(
                    f"{self.base_url}/render",
                    json=payload,
                    headers={"authorization": f"Bearer {self.token}"},
                )
        except httpx.HTTPError as silent:
            raise WorkerUnreachable(
                f"the render worker did not answer at {self.base_url}"
            ) from silent
        if answer.status_code == 401:
            raise WorkerUnreachable(
                "the render worker refused the api's credential — the api and "
                "the worker must read the same INTERNAL_API_TOKEN"
            )
        if answer.status_code == 422:
            raise ValuesRefused(_refusal.validate_json(answer.content).errors)
        if answer.is_error:
            raise WorkerUnreachable(
                f"the render worker answered {answer.status_code} at {self.base_url}"
            )
        return RenderedFile(
            body=answer.content,
            content_type=answer.headers.get("content-type", "application/octet-stream"),
        )


def a_regular_face() -> FontFacts:
    """What the fake reads in a font file unless a test says otherwise."""
    return FontFacts(
        format="ttf",
        family="Inter",
        subfamily="Regular",
        weight=400,
        italic=False,
        post_script_name="Inter-Regular",
        variable=False,
    )


@dataclass
class RecordingWorker:
    """The fake the tests drive: it answers what the test told it to, and
    keeps what it was asked, so that a test can say a re-upload was never
    inspected a second time."""

    answer: FontInspection = field(
        default_factory=lambda: ReadableFont(readable=True, font=a_regular_face())
    )
    inspections: list[bytes] = field(default_factory=list)
    validations: list[ValidateCall] = field(default_factory=list)
    renders: list[RenderCall] = field(default_factory=list)
    batch: BatchValidation = field(
        default_factory=lambda: BatchValidation(errors=[], template_errors=[])
    )
    file: bytes = b"rendered-file"
    value_errors: list[NamedProblem] | None = None

    def reads(self, **facts: object) -> None:
        """Answer with a readable font carrying these facts, everything else
        left as the plain regular face."""
        self.answer = ReadableFont(
            readable=True, font=a_regular_face().model_copy(update=facts)
        )

    def refuses(
        self, problem: Literal["unsupported_format", "unparseable_font"]
    ) -> None:
        """Answer that the file is no font this product can draw with."""
        self.answer = UnreadableFont(readable=False, problem=problem)

    async def inspect_font(self, font: bytes) -> FontInspection:
        self.inspections.append(font)
        return self.answer

    def refuses_rows(self, *errors: RowError) -> None:
        """Answer that this batch has these Row problems, and no Template ones."""
        self.batch = BatchValidation(errors=list(errors), template_errors=[])

    def refuses_template(self, *errors: NamedProblem) -> None:
        """Answer that the Template itself is not a document."""
        self.batch = BatchValidation(errors=[], template_errors=list(errors))

    def refuses_values(self, *errors: NamedProblem) -> None:
        """Answer that these values are wrong, and produce no bytes."""
        self.value_errors = list(errors)

    async def validate_batch(
        self,
        workspace_id: str,
        template: dict[str, Any],
        rows: list[dict[str, Any]],
        *,
        cells: bool = False,
    ) -> BatchValidation:
        self.validations.append(
            ValidateCall(
                workspace_id=workspace_id, template=template, rows=rows, cells=cells
            )
        )
        if cells and self.batch.rows is None:
            return self.batch.model_copy(update={"rows": list(rows)})
        return self.batch

    async def render(
        self,
        workspace_id: str,
        template: dict[str, Any],
        values: dict[str, Any],
        output: dict[str, Any],
    ) -> RenderedFile:
        self.renders.append(
            RenderCall(
                workspace_id=workspace_id,
                template=template,
                values=values,
                output=output,
            )
        )
        if self.value_errors is not None:
            raise ValuesRefused(self.value_errors)
        return RenderedFile(body=self.file, content_type=_content_type(output))


def _content_type(output: dict[str, Any]) -> str:
    """The content type the worker would send for this format."""
    match output.get("format"):
        case "png":
            return "image/png"
        case "jpeg":
            return "image/jpeg"
        case "pdf":
            return "application/pdf"
        case _:
            return "application/octet-stream"
