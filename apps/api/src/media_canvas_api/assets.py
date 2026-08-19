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

from fastapi import Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class Refusal(BaseModel):
    """Why a file was refused: the code the editor branches on, and the
    sentence it shows when it has nothing better."""

    code: str
    message: str


class AssetRefusalView(BaseModel):
    """The body of every asset refusal, and the 422 the routes document."""

    error: Refusal


# What a route declares, so that the generated client types the one 422 an
# editor actually handles.
REFUSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": AssetRefusalView,
        "description": "The file is not an asset this product takes.",
    }
}


class AssetRefused(Exception):
    """The uploaded file is not an asset this product takes.

    `code` is what the editor branches on; `message` is what it shows when it
    has nothing better, and both are the same in every refusal of that kind.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def refusal_response(_: Request, refused: Exception) -> JSONResponse:
    """The one shape every asset refusal reaches a client in."""
    assert isinstance(refused, AssetRefused)
    body = AssetRefusalView(error=Refusal(code=refused.code, message=refused.message))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content=body.model_dump()
    )


def asset_id(content: bytes) -> str:
    """The id of the bytes: their SHA-256, lowercase hex, never truncated."""
    return sha256(content).hexdigest()
