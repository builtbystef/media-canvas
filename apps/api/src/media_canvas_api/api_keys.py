"""The routes that mint, list, and revoke Workspace API keys."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, StringConstraints

from media_canvas_api.access import Database, Now, Owning
from media_canvas_api.keys import key_in, keys_in, mint
from media_canvas_api.models import ApiKey

router = APIRouter(prefix="/api/v1", tags=["api-keys"])

KeyName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]

ApiKeyId = Annotated[UUID, Path(alias="apiKeyId")]

NOT_A_KEY = "No such API key."


class KeyRequest(BaseModel):
    name: KeyName


class CreatedKey(BaseModel):
    id: UUID
    name: str
    prefix: str
    key: str


class KeyView(BaseModel):
    id: UUID
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None


@router.post(
    "/workspaces/{workspaceId}/api-keys",
    status_code=201,
    operation_id="createWorkspaceApiKey",
)
async def create_workspace_api_key(
    body: KeyRequest, owner: Owning, database: Database, clock: Now
) -> CreatedKey:
    """Mint a key. Only an Owner may, and the plaintext is in this answer
    only — listing the same key later will not show it again."""
    key, plaintext = await mint(database, owner.workspace_id, body.name, clock())
    return CreatedKey(id=key.id, name=key.name, prefix=key.prefix, key=plaintext)


@router.get("/workspaces/{workspaceId}/api-keys", operation_id="listWorkspaceApiKeys")
async def list_workspace_api_keys(owner: Owning, database: Database) -> list[KeyView]:
    """The keys of this Workspace. Only an Owner may see them, and never
    the secret itself."""
    return [as_view(key) for key in await keys_in(database, owner.workspace_id)]


@router.delete(
    "/workspaces/{workspaceId}/api-keys/{apiKeyId}",
    status_code=204,
    operation_id="deleteWorkspaceApiKey",
)
async def delete_workspace_api_key(
    key_id: ApiKeyId, owner: Owning, database: Database
) -> None:
    """Revoke a key. Only an Owner may, and it stops working at once."""
    key = await key_in(database, owner.workspace_id, key_id)
    if key is None:
        raise HTTPException(404, NOT_A_KEY)
    await database.delete(key)
    await database.commit()


def as_view(key: ApiKey) -> KeyView:
    return KeyView(
        id=key.id,
        name=key.name,
        prefix=key.prefix,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
    )
