"""The vendored Font Assets every Workspace starts with.

The manifest in ``packages/fonts`` is the one source of truth for this set.
Seeding copies each file under the Workspace's own storage prefix and writes
one Font Asset row for it. Repeating the operation finds the rows already
held and performs no writes; concurrent attempts still conflict safely on the
Workspace-plus-hash identity.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Literal, TypedDict, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from media_canvas_api.models import FontAsset, FontFormat
from media_canvas_api.storage import Bucket

PACKAGE_ROOT = Path(__file__).resolve().parents[4] / "packages" / "fonts"
MANIFEST = PACKAGE_ROOT / "manifest.json"
FILES = PACKAGE_ROOT / "files"
CONTENT_TYPES = {FontFormat.ttf: "font/ttf", FontFormat.otf: "font/otf"}


class ManifestFont(TypedDict):
    id: str
    file: str
    family: str
    weight: int
    style: Literal["normal", "italic"]
    subfamily: str
    postScriptName: str


class Manifest(TypedDict):
    fonts: list[ManifestFont]


@dataclass(frozen=True)
class BundledFont:
    manifest: ManifestFont
    content: bytes
    format: FontFormat


@cache
def bundled_fonts() -> tuple[BundledFont, ...]:
    """Load the verified manifest and its bytes once for this api process."""
    manifest = cast(Manifest, json.loads(MANIFEST.read_text()))
    return tuple(
        BundledFont(
            manifest=font,
            content=(FILES / font["file"]).read_bytes(),
            format=FontFormat(Path(font["file"]).suffix.removeprefix(".").lower()),
        )
        for font in manifest["fonts"]
    )


async def seed_bundled_fonts(
    database: AsyncSession,
    assets: Bucket,
    workspace_id: UUID,
    now: datetime,
) -> None:
    """Put this Workspace's bundled bytes and add any rows it lacks."""
    fonts = await run_in_threadpool(bundled_fonts)
    held = set(
        await database.scalars(
            select(FontAsset.id).where(
                FontAsset.workspace_id == workspace_id,
                FontAsset.id.in_(font.manifest["id"] for font in fonts),
            )
        )
    )
    missing = tuple(font for font in fonts if font.manifest["id"] not in held)
    if not missing:
        return

    def store() -> None:
        for font in missing:
            item = font.manifest
            key = storage_key(workspace_id, item["id"], font.format)
            assets.put(key, font.content, CONTENT_TYPES[font.format])

    await run_in_threadpool(store)
    await database.execute(
        insert(FontAsset)
        .values(
            [
                {
                    "workspace_id": workspace_id,
                    "id": font.manifest["id"],
                    "storage_key": storage_key(
                        workspace_id, font.manifest["id"], font.format
                    ),
                    "format": font.format,
                    "family": font.manifest["family"],
                    "subfamily": font.manifest["subfamily"],
                    "weight": font.manifest["weight"],
                    "italic": font.manifest["style"] == "italic",
                    "postscript_name": font.manifest["postScriptName"],
                    "byte_size": len(font.content),
                    "bundled": True,
                    "original_filename": Path(font.manifest["file"]).name,
                    "created_at": now,
                }
                for font in missing
            ]
        )
        .on_conflict_do_nothing()
    )


def storage_key(workspace_id: UUID, font_id: str, font_format: FontFormat) -> str:
    return f"{workspace_id}/fonts/{font_id}.{font_format}"
