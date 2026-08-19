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
from typing import Annotated, Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

from media_canvas_api.settings import Settings

# Long enough for the worker to read a font of the largest size the api
# accepts, short enough that a worker which has stopped answering does not
# hold an upload open indefinitely.
INSPECTION_TIMEOUT = 30.0


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


# A file the parser could not read is an answer, not a failure of the call:
# the api turns it into the refusal the uploader reads.
type FontInspection = Annotated[
    ReadableFont | UnreadableFont, Field(discriminator="readable")
]

_inspection = TypeAdapter[FontInspection](FontInspection)


class Worker(Protocol):
    """What the api asks the worker. One call today; render and batch
    validation join it as their own slices land."""

    async def inspect_font(self, font: bytes) -> FontInspection:
        """Read a font file with the compiler's own parser."""
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
            # The one refusal worth naming: the two services were given
            # different halves of a credential that is meant to be one.
            raise WorkerUnreachable(
                "the render worker refused the api's credential — the api and "
                "the worker must read the same INTERNAL_API_TOKEN"
            )
        if answer.is_error:
            raise WorkerUnreachable(
                f"the render worker answered {answer.status_code} at {self.base_url}"
            )
        return _inspection.validate_json(answer.content)


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
