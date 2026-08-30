"""The synchronous render: one call, file bytes back, nothing stored.

A Template is given values and the worker judges them. A design is given
nothing. Either way the response is the delivery — there is no Job and
nothing is written.
"""

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from media_canvas_api.access import WorkerService
from media_canvas_api.documents import Writable
from media_canvas_api.jobs import OutputFormat
from media_canvas_api.models import DocumentKind
from media_canvas_api.worker import NamedProblem, RenderRefusal, ValuesRefused

router = APIRouter(prefix="/api/v1", tags=["render"])

DESIGN_TAKES_NO_VALUES = "A design renders with no values."


class RenderBody(BaseModel):
    """What rendering takes: the values, and the file they should become."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    values: dict[str, Any] = Field(default_factory=dict)
    output: OutputFormat


@router.post(
    "/documents/{documentId}/render",
    operation_id="renderDocument",
    response_class=Response,
    responses={
        200: {
            "content": {
                "image/png": {"schema": {"type": "string", "format": "binary"}},
                "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                "application/pdf": {"schema": {"type": "string", "format": "binary"}},
            }
        },
        422: {"model": RenderRefusal},
    },
)
async def render_document(
    body: RenderBody, document: Writable, worker: WorkerService
) -> Response:
    """Turn this document into a file. Editor-level; a Viewer is refused.

    The bytes come back on this response. The same call twice is two
    responses; nothing is recorded and nothing is stored.
    """
    if document.kind is DocumentKind.design and body.values:
        return refused(NamedProblem(message=DESIGN_TAKES_NO_VALUES))
    try:
        rendered = await worker.render(
            str(document.workspace_id),
            document.document,
            body.values,
            body.output.model_dump(),
        )
    except ValuesRefused as refusal:
        return refused(*refusal.errors)
    return Response(content=rendered.body, media_type=rendered.content_type)


def refused(*errors: NamedProblem) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=RenderRefusal(errors=list(errors)).model_dump(
            by_alias=True, exclude_none=True
        ),
    )
