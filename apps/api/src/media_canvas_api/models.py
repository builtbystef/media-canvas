"""The tables the api owns for accounts and access (ADR-0005, ADR-0009).

Timestamps are written by the application rather than by the database, so that
everything with a deadline reads the same `Clock` the tests control.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from media_canvas_api.db import Base


class User(Base):
    """One person's identity on the instance, identified by their email.

    The email is stored lowercased, so that the address someone types is the
    address they reach whatever their keyboard did with the capitals.
    """

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Session(Base):
    """One signed-in browser.

    The cookie carries an opaque random token and this row keeps only its
    hash, so a database dump signs nobody in. `expires_at` rolls forward as
    the session is used.
    """

    __tablename__ = "sessions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OtpCode(Base):
    """One sign-in code that was asked for.

    The row outlives the code: after the code expires, is used, or runs out of
    attempts, its `created_at` still counts towards the per-email rate limits,
    which is why nothing here is deleted at the ten-minute mark.

    It holds an email rather than a user, because asking for a code says
    nothing about whether an account exists — the User is created on the first
    successful verification.
    """

    __tablename__ = "otp_codes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
