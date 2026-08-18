"""Who may reach a route at all.

The rule is default-deny: nothing is reachable without a session unless it is
on the list below, and that list is closed by the deployment-and-access spec.
Enforcement is middleware rather than a dependency because a dependency only
covers the routes that declare it — a route added without a thought about
access would be an open route, and here it is a closed one.
"""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from media_canvas_api.clock import Clock
from media_canvas_api.mailer import Mailer
from media_canvas_api.sessions import (
    COOKIE_NAME,
    SignedIn,
    authenticate,
    session_cookie_header,
)
from media_canvas_api.settings import Settings

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


class AccessMiddleware:
    """Opens the request's database session, and refuses the unsigned-in.

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
            if request.url.path not in PUBLIC_PATHS:
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


Database = Annotated[AsyncSession, Depends(request_database)]
CurrentSession = Annotated[SignedIn, Depends(request_signed_in)]
SendMail = Annotated[Mailer, Depends(request_mailer)]
Now = Annotated[Clock, Depends(request_clock)]
Configuration = Annotated[Settings, Depends(request_settings)]
