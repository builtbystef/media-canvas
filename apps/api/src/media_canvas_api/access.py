"""Who may reach a route at all, and what they may do once they are in.

Two questions, two mechanisms. Is the caller admitted at all is the middleware
below: default-deny, because a dependency only covers the routes that declare
it — a route added without a thought about access would be an open route, and
here it is a closed one. May this caller do *this*, in *this* Workspace, is
`requiring()`: one gate every Workspace-scoped route in the product declares
instead of writing the Role check out again.

Being admitted means one of two things, decided by the address. Everything a
person reaches carries a session cookie; everything under `/internal` is the
render worker, which holds no account and presents the credential the two
services share. Neither is ever accepted where the other belongs.
"""

from secrets import compare_digest
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Path, Request, params
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from media_canvas_api.clock import Clock
from media_canvas_api.mailer import Mailer
from media_canvas_api.memberships import membership_in
from media_canvas_api.models import Membership, Role
from media_canvas_api.sessions import (
    COOKIE_NAME,
    SignedIn,
    authenticate,
    session_cookie_header,
)
from media_canvas_api.settings import Settings
from media_canvas_api.storage import ObjectStore
from media_canvas_api.worker import Worker

# The whole of it. Asking for a code and verifying one cannot require a
# session, and health has to answer a probe that has no account; the invites
# spec adds previewing and accepting an invite, and nothing else ever joins
# the list. Everything absent from it — the interactive documentation and the
# schema included — needs a session.
PUBLIC_PATHS = frozenset(
    {
        "/api/health",
        "/api/v1/auth/otp/request",
        "/api/v1/auth/otp/verify",
    }
)

# Where the other service's half of the product lives. Nothing under it is
# reachable with a session, and nothing outside it with the credential: the
# worker is not a member of anything, and a browser never holds this secret.
INTERNAL_PREFIX = "/internal/"


class AccessMiddleware:
    """Opens the request's database session, and refuses whoever is not known.

    Authentication happens once, here, and the result is what the handlers
    read: a route never repeats the lookup, and a route can never forget it.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        settings: Settings = scope["app"].state.settings
        async with scope["app"].state.sessions() as database:
            request = Request(scope, receive)
            request.state.database = database
            if request.url.path.startswith(INTERNAL_PREFIX):
                if not carries_internal_credential(request, settings):
                    await unauthenticated(scope, receive, send)
                    return
            elif request.url.path not in PUBLIC_PATHS:
                token = request.cookies.get(COOKIE_NAME, "")
                signed_in = await authenticate(
                    database, token, scope["app"].state.clock()
                )
                if signed_in is None:
                    await unauthenticated(scope, receive, send)
                    return
                request.state.signed_in = signed_in
                if signed_in.rolled:
                    send = also_sending(
                        send,
                        session_cookie_header(
                            token, secure=settings.cookies_require_https
                        ),
                    )
            await self.app(scope, receive, send)


class DevelopmentCors:
    """Credentialed cross-origin access for the editor, and only in dev.

    A deployed stack serves the editor and the api from one origin behind the
    proxy, so it sends no cross-origin headers at all. Development is the one
    case where the two are apart. The decision is taken from the settings on
    the running app rather than at import, so that dumping the OpenAPI schema
    needs no environment.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.built_from: Settings | None = None
        self.wrapped: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        settings: Settings = scope["app"].state.settings
        if settings is not self.built_from:
            self.built_from = settings
            self.wrapped = self.wrap(settings)
        await self.wrapped(scope, receive, send)

    def wrap(self, settings: Settings) -> ASGIApp:
        if settings.development_origin is None:
            return self.app
        return CORSMiddleware(
            self.app,
            allow_origins=[settings.development_origin],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )


def also_sending(send: Send, cookie: str) -> Send:
    """The same `send`, with one `Set-Cookie` added to whatever it answers."""

    async def sending(message: Message) -> None:
        if message["type"] == "http.response.start":
            message["headers"] = [
                *message["headers"],
                (b"set-cookie", cookie.encode("latin-1")),
            ]
        await send(message)

    return sending


def carries_internal_credential(request: Request, settings: Settings) -> bool:
    """Whether this is the other service, presenting the shared credential.

    Compared in constant time, so that a wrong token tells nothing about the
    right one by how long the answer took — the same check the worker makes of
    the api at its own end of the pair.
    """
    presented = request.headers.get("authorization", "")
    scheme, _, token = presented.partition(" ")
    if scheme.lower() != "bearer":
        return False
    # Bytes rather than text: a header may carry anything, and comparing
    # strings that are not both ASCII is an error rather than a refusal.
    return compare_digest(token.encode(), settings.internal_api_token.encode())


async def unauthenticated(scope: Scope, receive: Receive, send: Send) -> None:
    response = JSONResponse({"detail": "Not authenticated"}, status_code=401)
    await response(scope, receive, send)


def request_database(request: Request) -> AsyncSession:
    return request.state.database


def request_signed_in(request: Request) -> SignedIn:
    return request.state.signed_in


def request_mailer(request: Request) -> Mailer:
    return request.app.state.mailer


def request_clock(request: Request) -> Clock:
    return request.app.state.clock


def request_settings(request: Request) -> Settings:
    return request.app.state.settings


def request_storage(request: Request) -> ObjectStore:
    return request.app.state.storage


def request_worker(request: Request) -> Worker:
    return request.app.state.worker


Database = Annotated[AsyncSession, Depends(request_database)]
CurrentSession = Annotated[SignedIn, Depends(request_signed_in)]
SendMail = Annotated[Mailer, Depends(request_mailer)]
Now = Annotated[Clock, Depends(request_clock)]
Configuration = Annotated[Settings, Depends(request_settings)]
Storage = Annotated[ObjectStore, Depends(request_storage)]
WorkerService = Annotated[Worker, Depends(request_worker)]


# The same answer for a Workspace that does not exist and for one the caller
# is simply not in: a stranger learns nothing from asking either way.
UNREACHABLE = "No such workspace."


def requiring(role: Role) -> params.Depends:
    """The gate a Workspace-scoped route declares, in place of a Role check.

    It resolves the caller's Membership in the Workspace the path names, and
    hands it to the route — so a route that has run at all has already been
    checked, and cannot have been checked wrongly. `role` is the least Role
    that is enough: an Owner passes an Editor's gate, an Editor a Viewer's.
    """

    async def resolve(
        workspace_id: Annotated[UUID, Path(alias="workspaceId")],
        database: Database,
        signed_in: CurrentSession,
    ) -> Membership:
        membership = await membership_in(database, workspace_id, signed_in.user.id)
        if membership is None:
            raise HTTPException(404, UNREACHABLE)
        refuse_unless(membership, role)
        return membership

    return Depends(resolve)


def refuse_unless(membership: Membership, role: Role) -> None:
    """Refuse the caller unless the Role they hold covers the one needed.

    Being told which Role a thing wants gives away nothing: the caller is
    already inside the Workspace, and the routes it has reached name it.
    """
    if not membership.role.covers(role):
        raise HTTPException(403, f"This action needs the {role} role.")


Viewing = Annotated[Membership, requiring(Role.viewer)]
Editing = Annotated[Membership, requiring(Role.editor)]
Owning = Annotated[Membership, requiring(Role.owner)]
