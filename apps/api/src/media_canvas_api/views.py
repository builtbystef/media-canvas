"""The JSON shapes the accounts routes answer with.

They live apart from the routers because more than one router answers with
them — `/me` and the members list both describe a Role, and the Workspace a
Role is held in is the same object wherever it appears.
"""

from uuid import UUID

from pydantic import BaseModel

from media_canvas_api.models import Role


class UserView(BaseModel):
    id: UUID
    email: str


class WorkspaceView(BaseModel):
    id: UUID
    name: str


class MembershipView(BaseModel):
    """A Workspace one User is in, from that User's side."""

    workspace: WorkspaceView
    role: Role


class MemberView(BaseModel):
    """A User in one Workspace, from the Workspace's side."""

    user: UserView
    role: Role
