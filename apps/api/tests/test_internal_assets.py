"""The one door the render worker reads asset bytes through.

The worker holds no Membership and no database client: it renders a document
that names assets by their hash, and the api — the only service that reads
asset rows or knows a storage key — hands over the bytes. The credential is
the shared internal one, and it is the whole of the authorization.

Fonts and images share the route, because the id is the hash and the kind
changes nothing about serving.
"""

from hashlib import sha256
from io import BytesIO
from typing import Any
from uuid import uuid4

from conftest import Accounts
from fastapi.testclient import TestClient
from PIL import Image

A_FONT = b"\x00\x01\x00\x00 the bytes of a font file"


def a_workspace(client: TestClient, name: str = "Studio") -> str:
    created = client.post("/api/v1/workspaces", json={"name": name})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def a_picture() -> bytes:
    written = BytesIO()
    Image.new("RGB", (40, 30), (200, 30, 30)).save(written, format="PNG")
    return written.getvalue()


def upload_font(client: TestClient, workspace: str) -> Any:
    return client.post(
        f"/api/v1/workspaces/{workspace}/fonts",
        files={"file": ("Inter-Regular.ttf", A_FONT, "font/ttf")},
    ).json()


def upload_image(client: TestClient, workspace: str) -> Any:
    return client.post(
        f"/api/v1/workspaces/{workspace}/images",
        files={"file": ("photo.png", a_picture(), "image/png")},
    ).json()


def as_the_worker(client: TestClient) -> dict[str, str]:
    """The credential the api and the worker share, and no session at all."""
    client.cookies.clear()
    token: str = client.app.state.settings.internal_api_token
    return {"authorization": f"Bearer {token}"}


def internal(workspace: str, asset: str) -> str:
    return f"/internal/workspaces/{workspace}/assets/{asset}"


def test_the_worker_reads_a_font_s_bytes_with_the_credential_and_no_membership(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload_font(client, workspace)

    served = client.get(internal(workspace, font["id"]), headers=as_the_worker(client))

    assert served.status_code == 200, served.text
    assert served.content == A_FONT
    assert served.headers["content-type"] == "font/ttf"


def test_an_image_comes_through_the_same_route_as_the_type_it_was_stored_as(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    image = upload_image(client, workspace)

    served = client.get(internal(workspace, image["id"]), headers=as_the_worker(client))

    assert served.status_code == 200, served.text
    assert sha256(served.content).hexdigest() == image["id"]
    assert served.headers["content-type"] == "image/png"


def test_without_the_credential_no_asset_bytes_leave_the_api(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload_font(client, workspace)
    address = internal(workspace, font["id"])
    client.cookies.clear()

    anonymous = client.get(address)
    wrong = client.get(address, headers={"authorization": "Bearer not-the-token"})

    assert (anonymous.status_code, wrong.status_code) == (401, 401)
    assert A_FONT not in anonymous.content
    assert A_FONT not in wrong.content


def test_a_session_is_no_way_in_to_the_worker_s_route(
    client: TestClient, accounts: Accounts
) -> None:
    """The internal credential is the whole of the authorization here: being
    signed in — even as the Workspace's Owner — is not it."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload_font(client, workspace)

    refused = client.get(internal(workspace, font["id"]))

    assert refused.status_code == 401


def test_an_unknown_workspace_and_an_unknown_asset_answer_the_same_way(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload_font(client, workspace)
    worker = as_the_worker(client)

    elsewhere = client.get(internal(str(uuid4()), font["id"]), headers=worker)
    unknown = client.get(internal(workspace, "0" * 64), headers=worker)

    assert (elsewhere.status_code, unknown.status_code) == (404, 404)
    assert elsewhere.json() == unknown.json()
