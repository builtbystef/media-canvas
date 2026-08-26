"""Workspace Invites: issuing them, reading them, and spending them.

An invite is the only way a second person reaches a Workspace. The token
lives in the mail and this module is the rest: one pending row per address
per Workspace, a seven-day life, and a single use.
"""

import secrets
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.access import (
    Configuration,
    Database,
    Now,
    Owning,
    SendMail,
)
from media_canvas_api.mailer import Mailer
from media_canvas_api.memberships import membership_in
from media_canvas_api.models import Invite, Membership, Role, Workspace
from media_canvas_api.sessions import (
    COOKIE_NAME,
    authenticate,
    end_session,
    set_session_cookie,
    start_session,
)
from media_canvas_api.users import find_or_create_user, normalise_email

router = APIRouter(prefix="/api/v1", tags=["invites"])

LIFETIME = timedelta(days=7)

EMAIL = Field(min_length=3, max_length=320)
InviteId = Annotated[UUID, Path(alias="inviteId")]


class InviteRequest(BaseModel):
    email: str = EMAIL
    role: Role


class InviteView(BaseModel):
    id: UUID
    email: str
    role: Role
    expires_at: datetime


class InvitePreview(BaseModel):
    workspace_name: str
    role: Role
    email: str


class InviteGone(Exception):
    """The token is unknown, already used, or has been revoked."""


class InviteExpired(Exception):
    """The invite's seven days have passed."""


@router.post(
    "/workspaces/{workspaceId}/invites",
    status_code=201,
    operation_id="createWorkspaceInvite",
)
async def create_workspace_invite(
    body: InviteRequest,
    owner: Owning,
    database: Database,
    mailer: SendMail,
    clock: Now,
    settings: Configuration,
) -> InviteView:
    """Mail an offer of Membership. Only an Owner may, and a second invite
    to the same address replaces the first."""
    workspace = await database.get_one(Workspace, owner.workspace_id)
    issued = await issue(
        database,
        mailer,
        workspace,
        body.email,
        body.role,
        clock(),
        settings.public_base_url,
    )
    return as_view(issued)


@router.get("/workspaces/{workspaceId}/invites", operation_id="listWorkspaceInvites")
async def list_workspace_invites(
    owner: Owning, database: Database, clock: Now
) -> list[InviteView]:
    """The pending invites. Only an Owner may see them."""
    return [
        as_view(invite)
        for invite in await pending_in(database, owner.workspace_id, clock())
    ]


@router.delete(
    "/workspaces/{workspaceId}/invites/{inviteId}",
    status_code=204,
    operation_id="revokeWorkspaceInvite",
)
async def revoke_workspace_invite(
    invite_id: InviteId, owner: Owning, database: Database
) -> None:
    """Take back a pending invite. Only an Owner may."""
    invite = await pending_by_id(database, owner.workspace_id, invite_id)
    if invite is None:
        raise HTTPException(404, "No such invite.")
    await database.delete(invite)
    await database.commit()


@router.get("/invites/{token}", operation_id="getInvite")
async def get_invite(token: str, database: Database, clock: Now) -> InvitePreview:
    """What the acceptance page shows before anyone accepts.

    No session: the token is the credential, and the answer names only this
    invite — the Workspace's name, the Role on offer, and the address it
    was sent to.
    """
    try:
        invite, workspace = await open_invite(database, token, clock())
    except InviteGone:
        raise HTTPException(404, "No such invite.") from None
    except InviteExpired:
        raise HTTPException(410, "That invite has expired.") from None
    return InvitePreview(
        workspace_name=workspace.name, role=invite.role, email=invite.email
    )


@router.post("/invites/{token}/accept", status_code=204, operation_id="acceptInvite")
async def accept_invite(
    token: str,
    request: Request,
    response: Response,
    database: Database,
    clock: Now,
    settings: Configuration,
) -> None:
    """Spend the invite: join the Workspace, and sign in as its User.

    No session is required. Any session the caller already holds is replaced,
    so the browser ends signed in as the invited account.
    """
    now = clock()
    try:
        invite, _workspace = await open_invite(database, token, now)
    except InviteGone:
        raise HTTPException(404, "No such invite.") from None
    except InviteExpired:
        raise HTTPException(410, "That invite has expired.") from None
    user = await find_or_create_user(database, invite.email, now)
    if await membership_in(database, invite.workspace_id, user.id) is None:
        database.add(
            Membership(
                workspace_id=invite.workspace_id,
                user_id=user.id,
                role=invite.role,
                created_at=now,
            )
        )
    await database.delete(invite)
    await database.commit()
    presented = request.cookies.get(COOKIE_NAME, "")
    current = await authenticate(database, presented, now)
    if current is not None:
        await end_session(database, current.session)
    session_token = await start_session(database, user, now)
    set_session_cookie(response, session_token, secure=settings.cookies_require_https)


async def issue(
    database: AsyncSession,
    mailer: Mailer,
    workspace: Workspace,
    email: str,
    role: Role,
    now: datetime,
    base_url: str,
) -> Invite:
    """Create the pending invite for this address, replacing any earlier one.

    The row is committed before the mail goes out, so a link that arrives
    always names a token the database holds.
    """
    address = normalise_email(email)
    existing = await database.scalar(
        select(Invite).where(
            Invite.workspace_id == workspace.id, Invite.email == address
        )
    )
    if existing is not None:
        await database.delete(existing)
        await database.flush()
    token = secrets.token_urlsafe(32)
    invite = Invite(
        workspace_id=workspace.id,
        email=address,
        role=role,
        token_hash=hash_token(token),
        created_at=now,
        expires_at=now + LIFETIME,
    )
    database.add(invite)
    await database.commit()
    mailer.send_invite(address, workspace.name, role, f"{base_url}/invites/{token}")
    return invite


async def open_invite(
    database: AsyncSession, token: str, now: datetime
) -> tuple[Invite, Workspace]:
    """The pending invite this token still names, or why it does not."""
    found = (
        await database.execute(
            select(Invite, Workspace)
            .join(Workspace, Invite.workspace_id == Workspace.id)
            .where(Invite.token_hash == hash_token(token))
        )
    ).one_or_none()
    if found is None:
        raise InviteGone
    invite, workspace = found
    if invite.expires_at <= now:
        raise InviteExpired
    return invite, workspace


async def pending_in(
    database: AsyncSession, workspace_id: UUID, now: datetime
) -> list[Invite]:
    return list(
        await database.scalars(
            select(Invite)
            .where(Invite.workspace_id == workspace_id, Invite.expires_at > now)
            .order_by(Invite.email)
        )
    )


async def pending_by_id(
    database: AsyncSession, workspace_id: UUID, invite_id: UUID
) -> Invite | None:
    return await database.scalar(
        select(Invite).where(
            Invite.id == invite_id, Invite.workspace_id == workspace_id
        )
    )


def as_view(invite: Invite) -> InviteView:
    return InviteView(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
    )


def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()
