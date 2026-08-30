"""What every asset kind shares: identity, and the shape of a refusal.

An asset's id is the hash of the bytes that are stored, so that the id names
exactly what a client will later download and the worker will later verify.

A refusal is its own envelope rather than the framework's `detail` string,
because the editor renders a specific message per reason — a convert-first
line for a WOFF2, an export-static-instances line for a variable font — and
must never have to match on prose to tell them apart.
"""

from hashlib import sha256
from typing import Any
from uuid import UUID

from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from media_canvas_api.storage import Bucket, serve


class Refusal(BaseModel):
    """Why a file was refused: the code the editor branches on, and the
    sentence it shows when it has nothing better."""

    code: str
    message: str


class AssetRefusalView(BaseModel):
    """The body of every asset refusal, whatever status carries it."""

    error: Refusal


REFUSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": AssetRefusalView,
        "description": "The file is not an asset this product takes.",
    }
}

PROTECTS: dict[int | str, dict[str, Any]] = {
    409: {
        "model": AssetRefusalView,
        "description": "The asset is one this product does not let go of.",
    }
}

IMMUTABLE = "private, max-age=31536000, immutable"


class AssetRefused(Exception):
    """This file is not an asset this product takes, or not one it lets go of.

    `code` is what the editor branches on; `message` is what it shows when it
    has nothing better, and both are the same in every refusal of that kind.
    `status` is 422 for a file that may not come in, and 409 for an asset that
    may not go out — one envelope either way, so the editor reads a code
    rather than two shapes.
    """

    def __init__(self, code: str, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def refusal_response(_: Request, refused: Exception) -> JSONResponse:
    """The one shape every asset refusal reaches a client in."""
    assert isinstance(refused, AssetRefused)
    body = AssetRefusalView(error=Refusal(code=refused.code, message=refused.message))
    return JSONResponse(status_code=refused.status, content=body.model_dump())


def asset_id(content: bytes) -> str:
    """The id of the bytes: their SHA-256, lowercase hex, never truncated."""
    return sha256(content).hexdigest()


def serving_path(workspace: UUID, kind: str, asset: str, suffix: str) -> str:
    """The one address an asset's bytes are at, and all a client is ever given.

    It carries the Workspace because that is half the asset's identity, and it
    never changes, because the rest of it is the hash of the bytes. The suffix
    is cosmetic — browsers and PDF tooling read it, and the lookup does not.

    The path is relative: the editor reaches the api at its own origin, behind
    the proxy in a deployment and behind the dev server's rewrite otherwise,
    so an absolute base would only be a way to get the origin wrong.
    """
    return f"/api/v1/workspaces/{workspace}/{kind}/{asset}.{suffix}"


def without_suffix(asked: str) -> str:
    """The id inside an address, with the cosmetic suffix taken back off.

    An asset id is lowercase hex and carries no dot of its own, so the first
    one begins the suffix — whichever suffix, or none, the caller wrote.
    """
    return asked.split(".", 1)[0]


def served(bucket: Bucket, key: str) -> StreamingResponse:
    """An asset's stored bytes, as a client receives them.

    The api streams them itself: no storage URL, no credential and no signed
    link reaches a client, here or anywhere else.
    """
    answer = serve(bucket, key)
    answer.headers["cache-control"] = IMMUTABLE
    return answer
