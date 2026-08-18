"""Signed-in browsers: starting a session, recognising one, and ending it.

The cookie carries an opaque random token and nothing else — no claims, no
signature, and so no signing secret anywhere in the deployment. The row is
the authority, which is what makes logging out immediate: the row goes, and
the cookie stops meaning anything.
"""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from media_canvas_api.models import Session, User

COOKIE_NAME = "media_canvas_session"
LIFETIME = timedelta(days=30)

# The expiry rolls forward as the session is used, but a write on every single
# request would be a write per request for nothing. A session that was rolled
# less than a day ago is left alone.
ROLL_AFTER = timedelta(days=1)


@dataclass(frozen=True)
class SignedIn:
    """Who the request is from: the session it presented, and its User.

    `rolled` says the expiry was just pushed forward, which is the moment the
    browser needs a fresh cookie too — a cookie that kept its original
    lifetime would expire on day thirty however alive the session was.
    """

    session: Session
    user: User
    rolled: bool = False


async def start_session(database: AsyncSession, user: User, now: datetime) -> str:
    """Open a session for this User and answer with the token for the cookie.

    The token is returned and never stored; only its hash reaches the table.
    """
    await database.execute(
        delete(Session).where(Session.user_id == user.id, Session.expires_at <= now)
    )
    token = secrets.token_urlsafe(32)
    database.add(
        Session(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + LIFETIME,
        )
    )
    await database.commit()
    return token


async def authenticate(
    database: AsyncSession, token: str, now: datetime
) -> SignedIn | None:
    """Who this token signs in, or nothing at all.

    An expired row is deleted as it is found: expiry is collected when the
    session is next touched, and nothing scheduled sweeps for it.
    """
    if not token:
        return None
    found = (
        await database.execute(
            select(Session, User)
            .join(User, Session.user_id == User.id)
            .where(Session.token_hash == hash_token(token))
        )
    ).one_or_none()
    if found is None:
        return None
    session, user = found
    if session.expires_at <= now:
        await database.delete(session)
        await database.commit()
        return None
    rolled = now + LIFETIME - session.expires_at >= ROLL_AFTER
    if rolled:
        session.expires_at = now + LIFETIME
        await database.commit()
    return SignedIn(session=session, user=user, rolled=rolled)


async def end_session(database: AsyncSession, session: Session) -> None:
    await database.delete(session)
    await database.commit()


def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def set_session_cookie(response: Response, token: str, *, secure: bool) -> None:
    """Hand the browser the session token.

    HTTP-only keeps it away from scripts, and SameSite=Lax keeps it off
    cross-site requests. In development the editor and the api are two ports
    of `localhost`, which is cross-origin but the same site, so the cookie
    still travels.
    """
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(LIFETIME.total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure,
    )


def session_cookie_header(token: str, *, secure: bool) -> str:
    """The `Set-Cookie` line for a token, for a response there is no handler
    to reach — the middleware refreshing a rolled session."""
    carrier = Response()
    set_session_cookie(carrier, token, secure=secure)
    return carrier.headers["set-cookie"]


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=secure
    )
