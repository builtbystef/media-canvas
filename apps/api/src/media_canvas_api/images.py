"""Uploading an Image Asset: normalize first, and hash what was normalized.

What is stored is what will be rendered. A phone photo carries an orientation
flag that says the picture is a quarter-turn from how its pixels lie, and a
browser honours it while a compiler measuring a frame does not — so the file
is re-encoded upright here, once, and every reader afterwards sees one truth.
The same pass drops the camera and location data, which would otherwise be
proxied straight back out to anyone holding the URL.

Only then are the bytes hashed, because the id has to name the bytes the
worker will later download and verify — and the duplicate check comes after
that, so the second upload of one photo finds the first and stores nothing.

A refused image reaches storage at no point: what is inspected is the request
body, in memory, and a file that is no image never gets a key.
"""

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Annotated, Any

from fastapi import APIRouter, File, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from PIL.Image import DecompressionBombError
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.dialects.postgresql import insert
from starlette.concurrency import run_in_threadpool

from media_canvas_api.access import Database, Editing, Now, Storage
from media_canvas_api.assets import REFUSES, AssetRefused, asset_id
from media_canvas_api.models import ImageAsset

router = APIRouter(prefix="/api/v1", tags=["images"])

# What an image file may weigh (node 3ko2p7).
MAX_IMAGE_BYTES = 25 * 1024 * 1024

# And what it may decode to, which is the limit that actually protects the
# renderer: 25 MB of PNG can expand into gigabytes inside a worker's page, so
# the file size alone says nothing about what it costs to open.
MAX_PIXELS = 50_000_000

# The three formats an Image Asset is ever stored as, by the name the parser
# gives them: the key suffix, and what a client is told the bytes are. The
# declared upload type appears nowhere — the format is whatever parses.
FORMATS = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
}

# How each format is written back out. Re-encoding is unavoidable — it is what
# strips the metadata and applies the rotation — so the lossy formats are
# written at a quality where a second generation is not something a designer
# can see. PNG is lossless and needs nothing said about it.
ENCODING: dict[str, dict[str, Any]] = {
    "PNG": {},
    "JPEG": {"quality": 95},
    "WEBP": {"quality": 95},
}

# One machine-readable code per way a file can fail to be an Image Asset, each
# with the sentence a person can act on. The editor branches on the code and
# shows the message; it never matches on prose.
TOO_LARGE = (
    "file_too_large",
    "An image file may be at most 25 MB. This one is larger — export it at a "
    "smaller size, or save it as JPEG rather than PNG.",
)
TOO_MANY_PIXELS = (
    "image_too_many_pixels",
    "An image may be at most 50 megapixels, however small the file is. This "
    "one decodes to more than that — scale it down before uploading it.",
)
UNSUPPORTED_IMAGE_FORMAT = (
    "unsupported_image_format",
    "Only PNG, JPEG and WebP images can be used. Convert this file to one of "
    "those — or, if it is an SVG, import it as vector artwork instead.",
)


@dataclass(frozen=True)
class NormalizedImage:
    """A picture as it will be stored, and what the record says about it."""

    content: bytes
    content_type: str
    suffix: str
    width: int
    height: int


class ImageAssetView(BaseModel):
    """One Image Asset, as the editor's Assets panel and canvas read it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    content_type: str
    width: int
    height: int
    byte_size: int
    original_filename: str
    created_at: datetime


@router.post(
    "/workspaces/{workspaceId}/images",
    status_code=201,
    operation_id="uploadImage",
    responses=REFUSES,
)
async def upload_image(
    response: Response,
    file: Annotated[UploadFile, File()],
    editor: Editing,
    database: Database,
    storage: Storage,
    clock: Now,
) -> ImageAssetView:
    """Take an image into this Workspace. Editor-level; a Viewer is refused.

    Answers 201 with the new record, or 200 with the record this Workspace
    already held for these bytes — a re-upload is a no-op by construction, and
    the editor never has to explain a duplicate.
    """
    if file.size is not None and file.size > MAX_IMAGE_BYTES:
        raise AssetRefused(*TOO_LARGE)
    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise AssetRefused(*TOO_LARGE)

    # Decoding and re-encoding a photograph is the one part of a request that
    # takes real processor time, so it happens off the event loop.
    picture = await run_in_threadpool(normalized, content)
    image_id = asset_id(picture.content)
    held = await database.get(
        ImageAsset, {"workspace_id": editor.workspace_id, "id": image_id}
    )
    if held is not None:
        response.status_code = 200
        return view_of(held)

    key = f"{editor.workspace_id}/images/{image_id}.{picture.suffix}"
    # The object first and the row second: an interrupted upload leaves bytes
    # nothing points at, which cost nothing, rather than a record of an image
    # that cannot be served.
    await run_in_threadpool(
        storage.assets.put, key, picture.content, picture.content_type
    )
    written = await database.execute(
        insert(ImageAsset)
        .values(
            workspace_id=editor.workspace_id,
            id=image_id,
            storage_key=key,
            content_type=picture.content_type,
            width=picture.width,
            height=picture.height,
            byte_size=len(picture.content),
            original_filename=(file.filename or "")[:255],
            created_at=clock(),
        )
        # Two identical uploads racing each other: the loser takes the winner's
        # record, which is the same answer a re-upload a day later would get.
        .on_conflict_do_nothing()
        .returning(ImageAsset.id)
    )
    if written.one_or_none() is None:
        response.status_code = 200
    await database.commit()
    stored = await database.get_one(
        ImageAsset, {"workspace_id": editor.workspace_id, "id": image_id}
    )
    return view_of(stored)


def normalized(content: bytes) -> NormalizedImage:
    """The uploaded bytes as they will be stored, or the refusal they earn.

    Opening a file reads its header only, so the pixel count is known — and
    refused — before anything the size of a photograph is decoded.
    """
    try:
        opened = Image.open(BytesIO(content))
    except DecompressionBombError as enormous:
        # A header claiming more pixels than the library will decode at all.
        # It is the same complaint as the limit below, in different words.
        raise AssetRefused(*TOO_MANY_PIXELS) from enormous
    except UnidentifiedImageError as unreadable:
        raise AssetRefused(*UNSUPPORTED_IMAGE_FORMAT) from unreadable
    with opened:
        image_format = opened.format or ""
        if image_format not in FORMATS:
            raise AssetRefused(*UNSUPPORTED_IMAGE_FORMAT)
        if opened.width * opened.height > MAX_PIXELS:
            raise AssetRefused(*TOO_MANY_PIXELS)
        suffix, content_type = FORMATS[image_format]
        upright = ImageOps.exif_transpose(opened)
        written = BytesIO()
        # Nothing but the pixels is passed to the encoder, and that is what
        # drops the camera and location data: metadata travels only when it is
        # handed over deliberately.
        upright.save(written, format=image_format, **ENCODING[image_format])
        return NormalizedImage(
            content=written.getvalue(),
            content_type=content_type,
            suffix=suffix,
            width=upright.width,
            height=upright.height,
        )


def view_of(image: ImageAsset) -> ImageAssetView:
    return ImageAssetView.model_validate(image, from_attributes=True)
