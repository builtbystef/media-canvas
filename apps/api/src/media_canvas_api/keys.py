"""Workspace API keys: minting them, recognising them, and revoking them.

The plaintext is returned once, at creation. Afterwards the row is a name, a
prefix, and a hash — enough to recognise a key and to know one when it is
presented, never enough to show it again.
"""

import secrets
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.models import ApiKey
from media_canvas_api.sessions import hash_token

KEY_MARKER = "mc_"
PREFIX_LENGTH = 8


async def mint(
    database: AsyncSession, workspace_id: UUID, name: str, now: datetime
) -> tuple[ApiKey, str]:
    """Create a key and answer with the row and the plaintext.

    The plaintext is returned and never stored; only its hash reaches the
    table. The caller commits.
    """
    secret = secrets.token_urlsafe(32)
    plaintext = f"{KEY_MARKER}{secret}"
    key = ApiKey(
        workspace_id=workspace_id,
        name=name,
        key_hash=hash_token(plaintext),
        prefix=secret[:PREFIX_LENGTH],
        created_at=now,
    )
    database.add(key)
    await database.commit()
    return key, plaintext


async def keys_in(database: AsyncSession, workspace_id: UUID) -> list[ApiKey]:
    return list(
        await database.scalars(
            select(ApiKey)
            .where(ApiKey.workspace_id == workspace_id)
            .order_by(ApiKey.created_at, ApiKey.id)
        )
    )


async def record_use(database: AsyncSession, key: ApiKey, now: datetime) -> None:
    """Note that this key was just presented.

    Best-effort: a failure here must not fail the request the key arrived
    with, so the caller wraps this and keeps going.
    """
    key.last_used_at = now
    await database.commit()


async def authenticate_key(database: AsyncSession, token: str) -> ApiKey | None:
    """The key this plaintext names, or nothing at all.

    Unknown and revoked are the same answer: the row is the authority, so a
    deleted key is an unknown key.
    """
    if not token.startswith(KEY_MARKER):
        return None
    return await database.scalar(
        select(ApiKey).where(ApiKey.key_hash == hash_token(token))
    )


async def key_in(
    database: AsyncSession, workspace_id: UUID, key_id: UUID
) -> ApiKey | None:
    return await database.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.workspace_id == workspace_id)
    )
