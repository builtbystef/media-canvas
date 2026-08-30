"""Sign-in codes: issuing them, and spending them.

No password exists in the product, so this is the whole of proving an address
belongs to you. The defences are all here: a short-lived single-use code, a
cap on how often it may be guessed, and a cap on how often one address may ask
for a new one. The rate limits are counted from `otp_codes` rows — Postgres is
the only store involved, and Redis stays a work signal (ADR-0004).
"""

import secrets
from datetime import datetime, timedelta
from hashlib import sha256
from hmac import compare_digest

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from media_canvas_api.mailer import Mailer
from media_canvas_api.models import OtpCode, User
from media_canvas_api.users import find_or_create_user, normalise_email

CODE_LIFETIME = timedelta(minutes=10)
MAX_ATTEMPTS = 5

BURST_WINDOW = timedelta(seconds=30)
HOURLY_WINDOW = timedelta(hours=1)
HOURLY_LIMIT = 10


class WrongCode(Exception):
    """The submitted digits are not the ones that were sent."""


class CodeUnusable(Exception):
    """There was a code, and it can no longer be spent: expired, already
    used, or out of attempts."""


class TooManyRequests(Exception):
    """This address has asked for codes faster than the limits allow."""


async def request_code(
    database: AsyncSession, mailer: Mailer, email: str, now: datetime
) -> None:
    """Issue a code for this address and mail it.

    Nothing here depends on whether the address has an account, and nothing
    here is reported back to the caller: the endpoint answers the same way
    either way, so it cannot be used to ask who is registered.
    """
    address = normalise_email(email)
    await forget_spent_codes(database, address, now)
    await refuse_over_the_limit(database, address, now)
    code = generate_code()
    database.add(
        OtpCode(
            email=address,
            code_hash=hash_code(address, code),
            created_at=now,
            expires_at=now + CODE_LIFETIME,
        )
    )
    await database.commit()
    mailer.send_otp(address, code)


async def verify_code(
    database: AsyncSession, email: str, code: str, now: datetime
) -> User:
    """Spend the address's newest code, and answer with the User it signs in.

    A newer code always supersedes an older one, so asking again is how
    someone recovers from a code that ran out of attempts.
    """
    address = normalise_email(email)
    await forget_spent_codes(database, address, now)
    issued = await database.scalar(
        select(OtpCode)
        .where(OtpCode.email == address)
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    if issued is None:
        raise WrongCode
    if (
        issued.consumed_at is not None
        or issued.expires_at <= now
        or issued.attempts >= MAX_ATTEMPTS
    ):
        raise CodeUnusable
    issued.attempts += 1
    if not compare_digest(issued.code_hash, hash_code(address, code)):
        await database.commit()
        raise WrongCode
    issued.consumed_at = now
    user = await find_or_create_user(database, address, now)
    await database.commit()
    return user


async def forget_spent_codes(database: AsyncSession, email: str, now: datetime) -> None:
    """Delete this address's rows that have stopped meaning anything.

    A code stops working after ten minutes, but its row keeps counting towards
    the hourly limit for an hour, so that is the horizon at which it goes.
    Nothing is scheduled: rows are removed when the address is next touched.
    """
    await database.execute(
        delete(OtpCode).where(
            OtpCode.email == email, OtpCode.created_at <= now - HOURLY_WINDOW
        )
    )


async def refuse_over_the_limit(
    database: AsyncSession, email: str, now: datetime
) -> None:
    """Refuse a request that either limit has already been reached by.

    Both windows are counted from the rows themselves, in one query, so the
    limits survive a restart and need no second store.
    """
    within_burst, within_hour = (
        await database.execute(
            select(
                func.count().filter(OtpCode.created_at > now - BURST_WINDOW),
                func.count(),
            ).where(OtpCode.email == email, OtpCode.created_at > now - HOURLY_WINDOW)
        )
    ).one()
    if within_burst >= 1 or within_hour >= HOURLY_LIMIT:
        raise TooManyRequests


def generate_code() -> str:
    """Six digits, uniformly drawn — leading zeros included."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(email: str, code: str) -> str:
    """The stored form of a code.

    The address goes into the digest as well, so that the column is not a
    lookup table of the million possible six-digit hashes.
    """
    return sha256(f"{email}:{code}".encode()).hexdigest()
