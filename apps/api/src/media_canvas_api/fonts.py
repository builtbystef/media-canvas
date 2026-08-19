"""Uploading a Font Asset: hash the bytes, ask the parser, then store.

The order is the whole design. Bytes are hashed first, so a Workspace that
already holds them gets its record straight back and never pays for inspection
twice. What is new goes to the render worker, whose parser is the one that
will later measure every line of text in the file — a font that parser cannot
read is exactly the asset that would hard-error mid-render, so it is refused
here instead. Only then are the bytes stored, and only then is the row
written, so a row can never point at bytes that are not there.

A refused font reaches storage at no point: there is no quarantine area and
nothing to sweep later.
"""

from datetime import datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Path,
    Response,
    UploadFile,
    params,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from starlette.concurrency import run_in_threadpool

from media_canvas_api.access import (
    Database,
    Editing,
    Now,
    Storage,
    Viewing,
    WorkerService,
    requiring,
)
from media_canvas_api.assets import (
    PROTECTS,
    REFUSES,
    AssetRefused,
    asset_id,
    served,
    serving_path,
    without_suffix,
)
from media_canvas_api.models import FontAsset, FontFormat, Membership, Role
from media_canvas_api.worker import FontFacts, FontInspection, UnreadableFont

router = APIRouter(prefix="/api/v1", tags=["fonts"])

# What a font file may weigh (node 3ko2p7). A face is hundreds of kilobytes;
# ten megabytes is a CJK family, and anything past it is a mistake.
MAX_FONT_BYTES = 10 * 1024 * 1024

# One machine-readable code per way a file can fail to be a Font Asset, each
# with the sentence a person can act on. The editor branches on the code and
# shows the message; it never matches on prose.
TOO_LARGE = (
    "file_too_large",
    "A font file may be at most 10 MB. This one is larger — check that it is "
    "a single font file rather than a collection or an archive.",
)
UNSUPPORTED_FORMAT = (
    "unsupported_format",
    "Only TTF and OTF font files can be used. A web font — WOFF or WOFF2 — "
    "has to be converted to TTF or OTF before it can be uploaded.",
)
VARIABLE_FONT = (
    "variable_font",
    "This is a variable font, and text measured from one is unreliable. "
    "Export the static instances you need from it, and upload those.",
)
UNPARSEABLE_FONT = (
    "unparseable_font",
    "This font file could not be read. It may be damaged or incomplete — try "
    "exporting it from your font tool again.",
)

# What the store is told the bytes are, and what a client is later served.
CONTENT_TYPES = {FontFormat.ttf: "font/ttf", FontFormat.otf: "font/otf"}

# The same answer for a font this Workspace does not hold as for one that was
# never uploaded anywhere: an id is a hash, and a stranger who guesses one
# learns nothing from asking.
UNREACHABLE = "No such font."

# The one asset that refuses to go: a face the product came with, which every
# Workspace is seeded with and none may take apart.
BUNDLED = (
    "asset_is_bundled",
    "This font came with the product, so it cannot be deleted. A font that "
    "somebody uploaded can be.",
)


class FontAssetView(BaseModel):
    """One Font Asset, as the editor's picker and Assets panel read it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    format: FontFormat
    family: str
    subfamily: str
    weight: int
    italic: bool
    postscript_name: str
    byte_size: int
    bundled: bool
    original_filename: str
    created_at: datetime
    url: str


def held(role: Role) -> params.Depends:
    """The gate every item route declares, in place of a lookup and a check.

    It resolves the font the address names inside the Workspace the address
    names, so a route that has run at all is looking at a font its caller may
    reach. The suffix comes off here, once, and no route below sees it.
    """

    async def resolve(
        font_id: Annotated[str, Path(alias="fontId")],
        membership: Annotated[Membership, requiring(role)],
        database: Database,
    ) -> FontAsset:
        font = await database.get(
            FontAsset,
            {
                "workspace_id": membership.workspace_id,
                "id": without_suffix(font_id),
            },
        )
        if font is None:
            raise HTTPException(404, UNREACHABLE)
        return font

    return Depends(resolve)


Readable = Annotated[FontAsset, held(Role.viewer)]
Deletable = Annotated[FontAsset, held(Role.editor)]


@router.post(
    "/workspaces/{workspaceId}/fonts",
    status_code=201,
    operation_id="uploadFont",
    responses=REFUSES,
)
async def upload_font(
    response: Response,
    file: Annotated[UploadFile, File()],
    editor: Editing,
    database: Database,
    storage: Storage,
    worker: WorkerService,
    clock: Now,
) -> FontAssetView:
    """Take a font file into this Workspace. Editor-level; a Viewer is refused.

    Answers 201 with the new record, or 200 with the record this Workspace
    already held for these bytes — a re-upload is a no-op by construction, and
    the editor never has to explain a duplicate.
    """
    if file.size is not None and file.size > MAX_FONT_BYTES:
        raise AssetRefused(*TOO_LARGE)
    content = await file.read()
    if len(content) > MAX_FONT_BYTES:
        raise AssetRefused(*TOO_LARGE)

    font_id = asset_id(content)
    held = await database.get(
        FontAsset, {"workspace_id": editor.workspace_id, "id": font_id}
    )
    if held is not None:
        response.status_code = 200
        return view_of(held)

    facts = readable(await worker.inspect_font(content))
    font_format = FontFormat(facts.format)
    key = f"{editor.workspace_id}/fonts/{font_id}.{font_format}"
    # The object first and the row second: an interrupted upload leaves bytes
    # nothing points at, which cost nothing, rather than a record of a font
    # that cannot be served.
    await run_in_threadpool(
        storage.assets.put, key, content, CONTENT_TYPES[font_format]
    )
    written = await database.execute(
        insert(FontAsset)
        .values(
            workspace_id=editor.workspace_id,
            id=font_id,
            storage_key=key,
            format=font_format,
            family=facts.family,
            subfamily=facts.subfamily,
            weight=facts.weight,
            italic=facts.italic,
            postscript_name=facts.post_script_name,
            byte_size=len(content),
            bundled=False,
            original_filename=(file.filename or "")[:255],
            created_at=clock(),
        )
        # Two identical uploads racing each other: the loser takes the winner's
        # record, which is the same answer a re-upload a day later would get.
        .on_conflict_do_nothing()
        .returning(FontAsset.id)
    )
    if written.one_or_none() is None:
        response.status_code = 200
    await database.commit()
    stored = await database.get_one(
        FontAsset, {"workspace_id": editor.workspace_id, "id": font_id}
    )
    return view_of(stored)


@router.get("/workspaces/{workspaceId}/fonts", operation_id="listFonts")
async def list_fonts(membership: Viewing, database: Database) -> list[FontAssetView]:
    """This Workspace's Font Assets, newest first.

    The whole library, every time: a Workspace holds the faces one team
    uploaded, which is a number a picker scrolls.
    """
    found = await database.scalars(
        select(FontAsset)
        .where(FontAsset.workspace_id == membership.workspace_id)
        .order_by(FontAsset.created_at.desc(), FontAsset.id)
    )
    return [view_of(font) for font in found]


@router.get(
    "/workspaces/{workspaceId}/fonts/{fontId}",
    operation_id="serveFont",
    response_class=StreamingResponse,
    responses={200: {"content": {"font/ttf": {}, "font/otf": {}}}},
)
async def serve_font(font: Readable, storage: Storage) -> StreamingResponse:
    """The font's own bytes. Any member of its Workspace may fetch them."""
    return served(storage.assets, font.storage_key)


@router.delete(
    "/workspaces/{workspaceId}/fonts/{fontId}",
    status_code=204,
    operation_id="deleteFont",
    responses=PROTECTS,
)
async def delete_font(font: Deletable, database: Database, storage: Storage) -> None:
    """Delete a font. Editor-level; a Viewer is refused.

    Unconditionally, and without counting anything (ADR-0007): a design, a
    template or an in-flight Generation Job that referenced it fails loudly by
    the missing-asset rule, and re-uploading the same bytes revives every one
    of those references at the same id.

    The row goes first and the object second. The other order would leave a
    record of a font whose bytes are gone, which is a font that cannot be
    served; this one leaves bytes nothing points at, which cost nothing.
    """
    if font.bundled:
        raise AssetRefused(*BUNDLED, status=409)
    key = font.storage_key
    await database.delete(font)
    await database.commit()
    await run_in_threadpool(storage.assets.delete, key)


def readable(inspection: FontInspection) -> FontFacts:
    """What the parser read, or the refusal the file has earned.

    A variable font is readable and still refused: text measured off its
    default instance is not the text a renderer would draw.
    """
    if isinstance(inspection, UnreadableFont):
        raise AssetRefused(
            *(
                UNSUPPORTED_FORMAT
                if inspection.problem == "unsupported_format"
                else UNPARSEABLE_FONT
            )
        )
    if inspection.font.variable:
        raise AssetRefused(*VARIABLE_FONT)
    return inspection.font


def view_of(font: FontAsset) -> FontAssetView:
    """One record as the editor reads it, with the address its bytes are at.

    The address is built from the record rather than kept beside it: the
    storage key is the api's own business and never leaves it.
    """
    return FontAssetView(
        id=font.id,
        format=font.format,
        family=font.family,
        subfamily=font.subfamily,
        weight=font.weight,
        italic=font.italic,
        postscript_name=font.postscript_name,
        byte_size=font.byte_size,
        bundled=font.bundled,
        original_filename=font.original_filename,
        created_at=font.created_at,
        url=serving_path(font.workspace_id, "fonts", font.id, font.format),
    )
