"""The tables the api owns (ADR-0005): accounts and access, and content.

Timestamps are written by the application rather than by the database, so that
everything with a deadline reads the same `Clock` the tests control.
"""

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from media_canvas_api.db import Base


class Role(StrEnum):
    """What one Membership may do inside its Workspace.

    The v1 set is closed, and the declaration order is the ladder: each Role
    covers everything the ones above it in this list may do, which is what
    lets a route name the least Role that is enough for it.
    """

    viewer = "viewer"
    editor = "editor"
    owner = "owner"

    def covers(self, needed: Role) -> bool:
        ladder = list(Role)
        return ladder.index(self) >= ladder.index(needed)


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


class Workspace(Base):
    """The tenant: the container every owned record belongs to.

    It has no owner column — ownership is a Role on a Membership, so a
    Workspace can have more than one Owner and never fewer than one.
    """

    __tablename__ = "workspaces"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Membership(Base):
    """One User's place in one Workspace, and the Role they hold there.

    The pair is the key: a User is in a Workspace once or not at all. Both
    sides cascade, so deleting a Workspace takes its Memberships with it in
    the same statement.
    """

    __tablename__ = "memberships"

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[Role] = mapped_column(Enum(Role, name="role"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DocumentKind(StrEnum):
    """Which of the two things a stored document is.

    One table holds both, so opening one is a single code path; this column is
    the only thing that tells them apart. A design becomes a template by being
    copied into one, never by changing this value.
    """

    design = "design"
    template = "template"


class Document(Base):
    """One stored Design Document, design or template.

    The api treats `document` as opaque JSON (ADR-0003) — `schema_version` is
    denormalized out of it so that operational queries never have to open it,
    and nothing else here is read from inside.

    `promoted_from_id` is lineage, not ownership: it points at the design a
    template was copied from, and it is cleared rather than followed when that
    design is deleted, so a template outlives whatever it came from.
    """

    __tablename__ = "documents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[DocumentKind] = mapped_column(Enum(DocumentKind, name="document_kind"))
    name: Mapped[str] = mapped_column(String(200))
    document: Mapped[dict[str, Any]] = mapped_column(JSONB)
    schema_version: Mapped[int]
    revision: Mapped[int]
    promoted_from_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FontFormat(StrEnum):
    """The two file formats a Font Asset is ever stored as."""

    ttf = "ttf"
    otf = "otf"


class FontAsset(Base):
    """One font file a Workspace holds.

    Its identity is the pair: the Workspace, and the SHA-256 of the bytes. The
    same file uploaded into two Workspaces is two assets with two stored
    objects, so deleting one Workspace can never take another's bytes with it.

    Family, subfamily, weight and italic exist so that a font picker can group
    faces; nothing in the render path reads them — a text element names the
    asset by its hash. `bundled` marks the vendored families seeded into a
    Workspace, which differ from uploaded fonts in nothing else.
    """

    __tablename__ = "font_assets"

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    storage_key: Mapped[str] = mapped_column(String(200))
    format: Mapped[FontFormat] = mapped_column(Enum(FontFormat, name="font_format"))
    family: Mapped[str] = mapped_column(String(200))
    subfamily: Mapped[str] = mapped_column(String(200))
    weight: Mapped[int]
    italic: Mapped[bool]
    postscript_name: Mapped[str] = mapped_column(String(200))
    byte_size: Mapped[int] = mapped_column(BigInteger)
    bundled: Mapped[bool]
    original_filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ImageAsset(Base):
    """One image file a Workspace holds.

    Its identity is the pair, exactly as a Font Asset's is: the Workspace, and
    the SHA-256 of the bytes. Those bytes are the normalized ones — an upload
    is re-encoded upright and stripped of its camera and location data before
    anything here is written — so the id names what a client downloads and
    what the worker verifies.

    Width and height are the post-normalization numbers, which are the only
    ones that exist: a photo the camera flagged as rotated is stored the way
    it is meant to be seen, and is recorded that way too.
    """

    __tablename__ = "image_assets"

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    storage_key: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    width: Mapped[int]
    height: Mapped[int]
    byte_size: Mapped[int] = mapped_column(BigInteger)
    original_filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
