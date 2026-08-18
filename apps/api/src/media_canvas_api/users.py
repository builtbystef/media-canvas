"""Finding, or first creating, the User behind an email address."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.models import User


def normalise_email(email: str) -> str:
    """The stored form of an address: trimmed and lowercased.

    One address is one User however it was typed, so this runs before every
    lookup and before every insert.
    """
    return email.strip().lower()


async def find_or_create_user(
    database: AsyncSession, email: str, now: datetime
) -> User:
    """The User for this address, created if the instance has never seen it.

    Signing up is signing in: there is no separate registration step, so the
    first successful verification of an address is what creates its User.
    """
    address = normalise_email(email)
    existing = await database.scalar(select(User).where(User.email == address))
    if existing is not None:
        return existing
    user = User(email=address, created_at=now)
    database.add(user)
    await database.flush()
    return user
