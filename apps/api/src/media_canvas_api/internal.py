"""The render worker's way to an asset's bytes.

The worker inlines every font and image into the page it renders, so that the
render itself fetches nothing — and it reads those bytes from here rather than
from object storage, because the api is the only service that reads asset rows
or knows a storage key (ADR-0005). The worker holds no Membership and no
database client; the credential the two services share is the whole of the
authorization, and `AccessMiddleware` has already checked it.

Fonts and images share one route: an asset id is the hash of its bytes, and
the kind changes nothing about serving them.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.access import Database, Storage
from media_canvas_api.assets import without_suffix
from media_canvas_api.models import FontAsset, ImageAsset
from media_canvas_api.storage import serve

router = APIRouter(prefix="/internal", include_in_schema=False)

UNREACHABLE = "No such asset."


@router.get("/workspaces/{workspaceId}/assets/{assetId}")
async def serve_asset(
    workspace_id: Annotated[UUID, Path(alias="workspaceId")],
    asset_id: Annotated[str, Path(alias="assetId")],
    database: Database,
    storage: Storage,
) -> StreamingResponse:
    """One asset's raw bytes, with the content type it was stored as."""
    key = await stored_key(database, workspace_id, without_suffix(asset_id))
    if key is None:
        raise HTTPException(404, UNREACHABLE)
    return serve(storage.assets, key)


async def stored_key(
    database: AsyncSession, workspace_id: UUID, asset_id: str
) -> str | None:
    """Where this Workspace's asset lies, whichever kind of asset it is.

    Two lookups by primary key rather than one query over both tables: the
    kinds keep their own tables (their metadata has almost nothing in common),
    and a font and an image can never share an id unless they are the same
    bytes.
    """
    identity = {"workspace_id": workspace_id, "id": asset_id}
    font = await database.get(FontAsset, identity)
    if font is not None:
        return font.storage_key
    image = await database.get(ImageAsset, identity)
    return image.storage_key if image is not None else None
