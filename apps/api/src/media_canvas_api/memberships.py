"""Workspaces, and who reaches them.

Membership is the only path from a User to a Workspace's content, so this is
where a Workspace is created, who is in it is read, and the one invariant of
the whole model lives: a Workspace always has at least one Owner.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Row, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.models import Membership, Role, User, Workspace


class LastOwner(Exception):
    """The Membership asked about is the Workspace's only Owner.

    A Workspace with no Owner would be a Workspace nobody can manage, invite
    into, or delete — so the last one may not be demoted, removed, or leave.
    Promoting somebody else first is the way out, and the way to hand a
    Workspace over.
    """


async def start_workspace(
    database: AsyncSession, user: User, name: str, now: datetime
) -> Workspace:
    """Create a Workspace with its first member — the User asking — as Owner.

    Nobody grants this: creating is how a Workspace comes to exist, and the
    creator is its Owner in the same statement, so there is never a moment
    where a Workspace has no Owner.
    """
    workspace = Workspace(name=name, created_at=now)
    database.add(workspace)
    await database.flush()
    database.add(
        Membership(
            workspace_id=workspace.id,
            user_id=user.id,
            role=Role.owner,
            created_at=now,
        )
    )
    await database.commit()
    return workspace


async def workspaces_of(
    database: AsyncSession, user: User
) -> list[Row[tuple[Workspace, Role]]]:
    """Every Workspace this User is in, with the Role they hold there."""
    return list(
        await database.execute(
            select(Workspace, Membership.role)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == user.id)
            .order_by(Workspace.name, Workspace.id)
        )
    )


async def membership_in(
    database: AsyncSession, workspace_id: UUID, user_id: UUID
) -> Membership | None:
    return await database.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace_id, Membership.user_id == user_id
        )
    )


async def members_of(
    database: AsyncSession, workspace_id: UUID
) -> list[Row[tuple[User, Role]]]:
    """Everyone in this Workspace, with the Role each of them holds."""
    return list(
        await database.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(User.email)
        )
    )


async def member(
    database: AsyncSession, workspace_id: UUID, user_id: UUID
) -> Row[tuple[User, Membership]] | None:
    """One named member of this Workspace, or nothing."""
    return (
        await database.execute(
            select(User, Membership)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.workspace_id == workspace_id, Membership.user_id == user_id
            )
        )
    ).one_or_none()


async def reassign(
    database: AsyncSession, membership: Membership, role: Role
) -> Membership:
    """Give a member a different Role, unless it empties the Owner seat."""
    if membership.role is Role.owner and role is not Role.owner:
        await refuse_to_leave_it_ownerless(database, membership)
    membership.role = role
    await database.commit()
    return membership


async def release(database: AsyncSession, membership: Membership) -> None:
    """Take one member out of a Workspace, unless they are its last Owner.

    Only the Membership goes: the User keeps their account and every other
    Workspace they are in.
    """
    if membership.role is Role.owner:
        await refuse_to_leave_it_ownerless(database, membership)
    await database.delete(membership)
    await database.commit()


async def refuse_to_leave_it_ownerless(
    database: AsyncSession, membership: Membership
) -> None:
    owners = await database.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.workspace_id == membership.workspace_id,
            Membership.role == Role.owner,
        )
    )
    if owners == 1:
        raise LastOwner


async def close_workspace(database: AsyncSession, workspace_id: UUID) -> None:
    """Delete a Workspace and everything the database holds for it.

    One statement: every table that belongs to a Workspace references it with
    `ON DELETE CASCADE`, so this row going takes its Memberships — and, as the
    later slices add them, its documents, assets, and jobs — with it. What
    lives outside the database is another slice's to remove.
    """
    await database.execute(delete(Workspace).where(Workspace.id == workspace_id))
    await database.commit()
