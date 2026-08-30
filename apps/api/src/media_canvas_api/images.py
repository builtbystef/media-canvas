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
from PIL import Image, ImageOps, UnidentifiedImageError
from PIL.Image import DecompressionBombError
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
    requiring,
)
from media_canvas_api.assets import (
    REFUSES,
    AssetRefused,
    asset_id,
    served,
    serving_path,
    without_suffix,
)
from media_canvas_api.models import ImageAsset, Membership, Role

router = APIRouter(prefix="/api/v1", tags=["images"])

MAX_IMAGE_BYTES = 25 * 1024 * 1024

MAX_PIXELS = 50_000_000

FORMATS = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
}

ENCODING: dict[str, dict[str, Any]] = {
    "PNG": {},
    "JPEG": {"quality": 95},
    "WEBP": {"quality": 95},
}

SUFFIXES = {content_type: suffix for suffix, content_type in FORMATS.values()}

UNREACHABLE = "No such image."

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
ANIMATED_WEBP = (
    "unsupported_image_format",
    "Animated WebP cannot be used. Export a still frame as PNG, JPEG or WebP.",
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
    url: str


def held(role: Role) -> params.Depends:
    """The gate every item route declares, in place of a lookup and a check.

    It resolves the image the address names inside the Workspace the address
    names, so a route that has run at all is looking at an image its caller
    may reach. The suffix comes off here, once, and no route below sees it.
    """

    async def resolve(
        image_id: Annotated[str, Path(alias="imageId")],
        membership: Annotated[Membership, requiring(role)],
        database: Database,
    ) -> ImageAsset:
        image = await database.get(
            ImageAsset,
            {
                "workspace_id": membership.workspace_id,
                "id": without_suffix(image_id),
            },
        )
        if image is None:
            raise HTTPException(404, UNREACHABLE)
        return image

    return Depends(resolve)


Readable = Annotated[ImageAsset, held(Role.viewer)]
Deletable = Annotated[ImageAsset, held(Role.editor)]


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

    picture = await run_in_threadpool(normalized, content)
    image_id = asset_id(picture.content)
    held = await database.get(
        ImageAsset, {"workspace_id": editor.workspace_id, "id": image_id}
    )
    if held is not None:
        response.status_code = 200
        return view_of(held)

    key = f"{editor.workspace_id}/images/{image_id}.{picture.suffix}"
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


@router.get("/workspaces/{workspaceId}/images", operation_id="listImages")
async def list_images(membership: Viewing, database: Database) -> list[ImageAssetView]:
    """This Workspace's Image Assets, newest first.

    The whole library, every time: a Workspace holds the pictures one team
    uploaded, which is a number a panel scrolls.
    """
    found = await database.scalars(
        select(ImageAsset)
        .where(ImageAsset.workspace_id == membership.workspace_id)
        .order_by(ImageAsset.created_at.desc(), ImageAsset.id)
    )
    return [view_of(image) for image in found]


@router.get(
    "/workspaces/{workspaceId}/images/{imageId}",
    operation_id="serveImage",
    response_class=StreamingResponse,
    responses={200: {"content": {"image/png": {}, "image/jpeg": {}, "image/webp": {}}}},
)
async def serve_image(image: Readable, storage: Storage) -> StreamingResponse:
    """The image's own bytes. Any member of its Workspace may fetch them."""
    return served(storage.assets, image.storage_key)


@router.delete(
    "/workspaces/{workspaceId}/images/{imageId}",
    status_code=204,
    operation_id="deleteImage",
)
async def delete_image(image: Deletable, database: Database, storage: Storage) -> None:
    """Delete an image. Editor-level; a Viewer is refused.

    Unconditionally, and without counting anything (ADR-0007): a design, a
    template or an in-flight Generation Job that referenced it fails loudly by
    the missing-asset rule, and re-uploading the same bytes revives every one
    of those references at the same id.

    The row goes first and the object second. The other order would leave a
    record of an image whose bytes are gone, which is an image that cannot be
    served; this one leaves bytes nothing points at, which cost nothing.
    """
    key = image.storage_key
    await database.delete(image)
    await database.commit()
    await run_in_threadpool(storage.assets.delete, key)


def normalized(content: bytes) -> NormalizedImage:
    """The uploaded bytes as they will be stored, or the refusal they earn.

    Opening a file reads its header only, so the pixel count is known — and
    refused — before anything the size of a photograph is decoded.
    """
    try:
        opened = Image.open(BytesIO(content))
    except DecompressionBombError as enormous:
        raise AssetRefused(*TOO_MANY_PIXELS) from enormous
    except UnidentifiedImageError as unreadable:
        raise AssetRefused(*UNSUPPORTED_IMAGE_FORMAT) from unreadable
    with opened:
        image_format = opened.format or ""
        if image_format not in FORMATS:
            raise AssetRefused(*UNSUPPORTED_IMAGE_FORMAT)
        if image_format == "WEBP" and getattr(opened, "is_animated", False):
            raise AssetRefused(*ANIMATED_WEBP)
        if opened.width * opened.height > MAX_PIXELS:
            raise AssetRefused(*TOO_MANY_PIXELS)
        suffix, content_type = FORMATS[image_format]
        upright = ImageOps.exif_transpose(opened)
        written = BytesIO()
        upright.save(written, format=image_format, **ENCODING[image_format])
        return NormalizedImage(
            content=written.getvalue(),
            content_type=content_type,
            suffix=suffix,
            width=upright.width,
            height=upright.height,
        )


def view_of(image: ImageAsset) -> ImageAssetView:
    """One record as the editor reads it, with the address its bytes are at.

    The address is built from the record rather than kept beside it: the
    storage key is the api's own business and never leaves it.
    """
    return ImageAssetView(
        id=image.id,
        content_type=image.content_type,
        width=image.width,
        height=image.height,
        byte_size=image.byte_size,
        original_filename=image.original_filename,
        created_at=image.created_at,
        url=serving_path(
            image.workspace_id, "images", image.id, SUFFIXES[image.content_type]
        ),
    )
