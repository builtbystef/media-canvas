"""Workspace API keys, at the public HTTP seam."""

from collections.abc import Iterator
from hashlib import sha256

import pytest
from conftest import Accounts, FakeClock, Join
from fastapi import FastAPI
from fastapi.testclient import TestClient
from media_canvas_api import api_keys, auth, workspaces
from media_canvas_api.access import AccessMiddleware, Editing, Owning
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.main import lifespan
from sqlalchemy import Engine, text


def test_an_owner_creates_a_key_and_sees_the_plaintext_only_then(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    listed = client.get(f"/api/v1/workspaces/{workspace}/api-keys")

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "CI"
    assert body["key"].startswith("mc_")
    assert body["prefix"] == body["key"].removeprefix("mc_")[:8]
    assert listed.status_code == 200
    assert listed.json() == [
        {
            "id": body["id"],
            "name": "CI",
            "prefix": body["prefix"],
            "created_at": listed.json()[0]["created_at"],
            "last_used_at": None,
        }
    ]
    assert "key" not in listed.json()[0]


def test_only_the_hash_is_stored_and_only_an_owner_touches_keys(
    client: TestClient, accounts: Accounts, joining: Join, stored: Engine
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    joining(workspace, bob, "editor")
    minted = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    assert minted.status_code == 201, minted.text
    key_id = minted.json()["id"]
    plaintext = minted.json()["key"]

    accounts.acting_as(bob)
    created = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "Bob's"}
    )
    listed = client.get(f"/api/v1/workspaces/{workspace}/api-keys")
    revoked = client.delete(f"/api/v1/workspaces/{workspace}/api-keys/{key_id}")

    assert [created.status_code, listed.status_code, revoked.status_code] == [
        403,
        403,
        403,
    ]
    with stored.connect() as connection:
        row = connection.execute(
            text("SELECT key_hash, name, prefix FROM api_keys")
        ).one()
    assert row.key_hash == sha256(plaintext.encode()).hexdigest()
    assert plaintext not in (row.key_hash, row.name, row.prefix)


def test_a_key_is_refused_on_accounts_routes_that_a_cookie_may_call(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    minted = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    assert minted.status_code == 201, minted.text
    key = minted.json()["key"]
    members = f"/api/v1/workspaces/{workspace}/members"
    client.cookies.clear()

    with_key = client.get(members, headers=bearer(key))
    accounts.acting_as(alice)
    with_cookie = client.get(members)

    assert with_key.status_code == 403
    assert with_cookie.status_code == 200


def test_a_revoked_or_unknown_key_is_not_authenticated(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    minted = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    assert minted.status_code == 201, minted.text
    key = minted.json()["key"]
    members = f"/api/v1/workspaces/{workspace}/members"
    client.cookies.clear()
    assert client.get(members, headers=bearer(key)).status_code == 403

    accounts.acting_as(alice)
    revoked = client.delete(
        f"/api/v1/workspaces/{workspace}/api-keys/{minted.json()['id']}"
    )
    assert revoked.status_code == 204
    client.cookies.clear()

    reused = client.get(members, headers=bearer(key))
    unknown = client.get(members, headers=bearer("mc_not-a-key"))

    assert (reused.status_code, unknown.status_code) == (401, 401)


@pytest.fixture
def gated(mailer: RecordingMailer, clock: FakeClock) -> Iterator[TestClient]:
    """The api, with two extra routes: an Editor probe and an Owner probe.

    Both sit on the generation surface so a key can reach them; that is the
    declaration the generation routes will make, and the only way this issue
    can observe Editor-equivalent identity without those routes.
    """
    api = FastAPI(lifespan=lifespan)
    api.include_router(auth.router)
    api.include_router(workspaces.router)
    api.include_router(api_keys.router)

    @api.get("/api/v1/workspaces/{workspaceId}/editor-probe")
    async def editor_probe(membership: Editing) -> dict[str, str]:
        return {"role": membership.role}

    @api.get("/api/v1/workspaces/{workspaceId}/owner-probe")
    async def owner_probe(membership: Owning) -> dict[str, str]:
        return {"role": membership.role}

    api.add_middleware(AccessMiddleware)
    with TestClient(api) as started:
        started.app.state.mailer = mailer
        started.app.state.clock = clock
        started.app.state.generation_surface = lambda path: path.endswith("-probe")
        yield started


def test_a_key_is_an_editor_of_its_workspace(
    gated: TestClient, mailer: RecordingMailer
) -> None:
    accounts = Accounts(gated, mailer)
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(gated)
    minted = gated.post(f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"})
    assert minted.status_code == 201, minted.text
    key = minted.json()["key"]
    gated.cookies.clear()

    as_editor = gated.get(
        f"/api/v1/workspaces/{workspace}/editor-probe", headers=bearer(key)
    )
    as_owner = gated.get(
        f"/api/v1/workspaces/{workspace}/owner-probe", headers=bearer(key)
    )

    assert as_editor.status_code == 200
    assert as_editor.json() == {"role": "editor"}
    assert as_owner.status_code == 403


def test_last_use_is_recorded_and_does_not_fail_the_request(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    minted = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    assert minted.status_code == 201, minted.text
    key = minted.json()["key"]
    members = f"/api/v1/workspaces/{workspace}/members"
    client.cookies.clear()

    refused = client.get(members, headers=bearer(key))
    accounts.acting_as(alice)
    listed = client.get(f"/api/v1/workspaces/{workspace}/api-keys")

    assert refused.status_code == 403
    assert listed.json()[0]["last_used_at"] is not None


def bearer(key: str) -> dict[str, str]:
    return {"authorization": f"Bearer {key}"}


def a_workspace(client: TestClient) -> str:
    created = client.post("/api/v1/workspaces", json={"name": "Studio"})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace
