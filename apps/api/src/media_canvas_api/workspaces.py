"""The routes that create a Workspace and manage who is in it."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from media_canvas_api.access import (
    UNREACHABLE,
    CurrentSession,
    Database,
    Now,
    Owning,
    Storage,
    Viewing,
    refuse_unless,
)
from media_canvas_api.bundled_fonts import seed_bundled_fonts
from media_canvas_api.memberships import (
    LastOwner,
    close_workspace,
    member,
    members_of,
    membership_in,
    reassign,
    release,
    start_workspace,
)
from media_canvas_api.models import Membership, Role, Workspace
from media_canvas_api.storage import ObjectStore
from media_canvas_api.views import MemberView, UserView, WorkspaceView

router = APIRouter(prefix="/api/v1", tags=["workspaces"])

# A name is what people pick their Workspace out of a list by: never empty,
# and never long enough to be prose.
WorkspaceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class WorkspaceDetails(BaseModel):
    name: WorkspaceName


class RoleChange(BaseModel):
    role: Role


# Who a route is about, when that is somebody other than the caller.
MemberId = Annotated[UUID, Path(alias="userId")]

NOT_A_MEMBER = "No such member of this workspace."
OWNERLESS = "A workspace cannot be left without an owner."


@router.post("/workspaces", status_code=201, operation_id="createWorkspace")
async def create_workspace(
    body: WorkspaceDetails,
    database: Database,
    signed_in: CurrentSession,
    storage: Storage,
    clock: Now,
) -> WorkspaceView:
    """Create a Workspace with its Owner and bundled fonts ready to use."""
    now = clock()
    workspace = await start_workspace(database, signed_in.user, body.name, now)
    await seed_bundled_fonts(database, storage.assets, workspace.id, now)
    await database.commit()
    return WorkspaceView(id=workspace.id, name=workspace.name)


@router.patch("/workspaces/{workspaceId}", operation_id="renameWorkspace")
async def rename_workspace(
    body: WorkspaceDetails, owner: Owning, database: Database
) -> WorkspaceView:
    """Give the Workspace another name. Only an Owner may."""
    workspace = await database.get_one(Workspace, owner.workspace_id)
    workspace.name = body.name
    await database.commit()
    return WorkspaceView(id=workspace.id, name=workspace.name)


@router.delete(
    "/workspaces/{workspaceId}", status_code=204, operation_id="deleteWorkspace"
)
async def delete_workspace(
    workspace_id: Annotated[UUID, Path(alias="workspaceId")],
    signed_in: CurrentSession,
    database: Database,
    storage: Storage,
) -> None:
    """Delete the Workspace and its contents. Only an Owner may, and it ends
    the Workspace for every member of it at once.

    The rows go first and the stored objects second, so a crash between the
    two never leaves a record pointing at a file that is already gone. A
    second call, after the rows have already gone, still takes leftover
    objects — the prefix delete is safe to run again — and answers the same
    404 a stranger would get, so it cannot tell a deleted Workspace from one
    that never existed.
    """
    membership = await membership_in(database, workspace_id, signed_in.user.id)
    if membership is None:
        if await database.get(Workspace, workspace_id) is None:
            await remove_stored_objects(storage, workspace_id)
        raise HTTPException(404, UNREACHABLE)
    refuse_unless(membership, Role.owner)
    await close_workspace(database, workspace_id)
    await remove_stored_objects(storage, workspace_id)


async def remove_stored_objects(storage: ObjectStore, workspace_id: UUID) -> None:
    """Delete every object this Workspace stored, in either bucket.

    The prefix is the Workspace's id: assets live under `{id}/fonts` and
    `{id}/images`, outputs under `{id}/jobs`. A prefix that holds nothing is
    not an error, so this is safe to run again after a crash that already
    took some of the files.
    """
    prefix = f"{workspace_id}/"
    await run_in_threadpool(storage.assets.delete_prefix, prefix)
    await run_in_threadpool(storage.outputs.delete_prefix, prefix)


@router.get("/workspaces/{workspaceId}/members", operation_id="listWorkspaceMembers")
async def list_workspace_members(
    membership: Viewing, database: Database
) -> list[MemberView]:
    """Everyone in the Workspace. Any member may see who they work with."""
    return [
        MemberView(user=UserView(id=user.id, email=user.email), role=role)
        for user, role in await members_of(database, membership.workspace_id)
    ]


@router.patch(
    "/workspaces/{workspaceId}/members/{userId}", operation_id="changeMemberRole"
)
async def change_member_role(
    user_id: MemberId,
    body: RoleChange,
    owner: Owning,
    database: Database,
) -> MemberView:
    """Give one member a different Role. Only an Owner may."""
    found = await member(database, owner.workspace_id, user_id)
    if found is None:
        raise HTTPException(404, NOT_A_MEMBER)
    user, membership = found
    try:
        await reassign(database, membership, body.role)
    except LastOwner:
        raise HTTPException(409, OWNERLESS) from None
    return MemberView(user=UserView(id=user.id, email=user.email), role=membership.role)


@router.delete(
    "/workspaces/{workspaceId}/members/{userId}",
    status_code=204,
    operation_id="removeWorkspaceMember",
)
async def remove_workspace_member(
    user_id: MemberId, owner: Owning, database: Database
) -> None:
    """Take somebody out of the Workspace. Only an Owner may."""
    found = await member(database, owner.workspace_id, user_id)
    if found is None:
        raise HTTPException(404, NOT_A_MEMBER)
    _, membership = found
    await leave_or_refuse(database, membership)


@router.post(
    "/workspaces/{workspaceId}/leave", status_code=204, operation_id="leaveWorkspace"
)
async def leave_workspace(membership: Viewing, database: Database) -> None:
    """Give up your own Membership. Every member may, the last Owner aside."""
    await leave_or_refuse(database, membership)


async def leave_or_refuse(database: AsyncSession, membership: Membership) -> None:
    """Remove one Membership, or say why the Workspace will not allow it."""
    try:
        await release(database, membership)
    except LastOwner:
        raise HTTPException(409, OWNERLESS) from None
