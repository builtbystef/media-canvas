"""The routes that sign someone in, sign them out, and say who they are."""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from media_canvas_api.access import (
    Configuration,
    CurrentSession,
    Database,
    Now,
    SendMail,
)
from media_canvas_api.memberships import workspaces_of
from media_canvas_api.otp import (
    CodeUnusable,
    TooManyRequests,
    WrongCode,
    request_code,
    verify_code,
)
from media_canvas_api.sessions import (
    clear_session_cookie,
    end_session,
    set_session_cookie,
    start_session,
)
from media_canvas_api.views import MembershipView, UserView, WorkspaceView

router = APIRouter(prefix="/api/v1", tags=["auth"])

EMAIL = Field(min_length=3, max_length=320)


class CodeRequest(BaseModel):
    email: str = EMAIL


class CodeVerification(BaseModel):
    email: str = EMAIL
    code: str = Field(min_length=6, max_length=6)


class Identity(BaseModel):
    user: UserView
    memberships: list[MembershipView]


@router.post("/auth/otp/request", status_code=204, operation_id="requestSignInCode")
async def request_sign_in_code(
    body: CodeRequest, database: Database, mailer: SendMail, clock: Now
) -> None:
    """Mail a sign-in code to an address.

    The answer is the same whether or not that address has an account, so
    nobody can ask this endpoint who is registered.
    """
    try:
        await request_code(database, mailer, body.email, clock())
    except TooManyRequests:
        raise HTTPException(
            429, "Too many sign-in codes have been requested for this address."
        ) from None


@router.post("/auth/otp/verify", status_code=204, operation_id="verifySignInCode")
async def verify_sign_in_code(
    body: CodeVerification,
    response: Response,
    database: Database,
    clock: Now,
    settings: Configuration,
) -> None:
    """Spend a code, and answer with the session cookie every route wants.

    The User is created here when the address is new to the instance.
    """
    now = clock()
    try:
        user = await verify_code(database, body.email, body.code, now)
    except WrongCode:
        raise HTTPException(401, "That code is not the one that was sent.") from None
    except CodeUnusable:
        raise HTTPException(410, "That code can no longer be used.") from None
    token = await start_session(database, user, now)
    set_session_cookie(response, token, secure=settings.cookies_require_https)


@router.post("/auth/logout", status_code=204, operation_id="signOut")
async def sign_out(
    response: Response,
    database: Database,
    signed_in: CurrentSession,
    settings: Configuration,
) -> None:
    """End this session. The cookie that carried it stops working at once."""
    await end_session(database, signed_in.session)
    clear_session_cookie(response, secure=settings.cookies_require_https)


@router.get("/me", operation_id="getCurrentUser")
async def get_current_user(signed_in: CurrentSession, database: Database) -> Identity:
    """The signed-in User, and the Workspaces they are a member of.

    The list is empty for someone signing in for the first time, which is the
    signal the editor lands them on Workspace creation with.
    """
    return Identity(
        user=UserView(id=signed_in.user.id, email=signed_in.user.email),
        memberships=[
            MembershipView(
                workspace=WorkspaceView(id=workspace.id, name=workspace.name),
                role=role,
            )
            for workspace, role in await workspaces_of(database, signed_in.user)
        ],
    )
