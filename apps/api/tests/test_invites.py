from datetime import timedelta

from conftest import Account, Accounts, FakeClock, Join
from fastapi.testclient import TestClient
from httpx import Response
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.settings import DEVELOPMENT_ORIGIN


def test_an_owner_invite_mails_the_workspace_role_and_a_link_at_the_derived_base(
    client: TestClient, accounts: Accounts, mailer: RecordingMailer
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client, "Studio")

    sent_on_dev = invite(client, workspace, "bob@example.com", "editor")
    settings = client.app.state.settings
    client.app.state.settings = settings.model_copy(
        update={"public_url": "https://canvas.example"}
    )
    sent_on_public = invite(client, workspace, "cara@example.com", "viewer")
    client.app.state.settings = settings.model_copy(
        update={"domain": "app.example", "public_url": "https://ignored.example"}
    )
    sent_on_domain = invite(client, workspace, "drew@example.com", "owner")

    assert [
        response.status_code
        for response in (sent_on_dev, sent_on_public, sent_on_domain)
    ] == [
        201,
        201,
        201,
    ]
    assert [
        (sent.workspace_name, sent.role, sent.accept_url.rsplit("/invites/", 1)[0])
        for sent in mailer.invites
    ] == [
        ("Studio", "editor", DEVELOPMENT_ORIGIN),
        ("Studio", "viewer", "https://canvas.example"),
        ("Studio", "owner", "https://app.example"),
    ]
    assert all(sent.accept_url.rsplit("/", 1)[-1] for sent in mailer.invites)


def test_only_an_owner_sends_lists_and_revokes_invites(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = owned_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")
    sent = invite(client, workspace, "cara@example.com", "viewer")
    assert sent.status_code == 201

    accounts.acting_as(bob)
    listed_as_editor = client.get(f"/api/v1/workspaces/{workspace}/invites")
    sent_as_editor = invite(client, workspace, "drew@example.com", "editor")
    revoked_as_editor = client.delete(
        f"/api/v1/workspaces/{workspace}/invites/{sent.json()['id']}"
    )

    accounts.acting_as(alice)
    listed = client.get(f"/api/v1/workspaces/{workspace}/invites")
    revoked = client.delete(
        f"/api/v1/workspaces/{workspace}/invites/{sent.json()['id']}"
    )
    after = client.get(f"/api/v1/workspaces/{workspace}/invites")

    assert [
        listed_as_editor.status_code,
        sent_as_editor.status_code,
        revoked_as_editor.status_code,
    ] == [
        403,
        403,
        403,
    ]
    assert listed.status_code == 200
    assert [(pending["email"], pending["role"]) for pending in listed.json()] == [
        ("cara@example.com", "viewer")
    ]
    assert revoked.status_code == 204
    assert after.json() == []


def test_inviting_the_same_address_again_replaces_the_pending_invite(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    first = invite(client, workspace, "bob@example.com", "viewer")
    second = invite(client, workspace, "Bob@Example.com", "editor")
    listed = client.get(f"/api/v1/workspaces/{workspace}/invites")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert [(pending["email"], pending["role"]) for pending in listed.json()] == [
        ("bob@example.com", "editor")
    ]


def test_previewing_an_invite_needs_no_session_and_refuses_like_accept(
    client: TestClient,
    accounts: Accounts,
    mailer: RecordingMailer,
    clock: FakeClock,
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    sent = invite(client, workspace, "bob@example.com", "editor")
    token = token_of(mailer)
    client.cookies.clear()

    pending = client.get(f"/api/v1/invites/{token}")
    unknown = client.get("/api/v1/invites/not-a-token")

    accounts.acting_as(alice)
    client.delete(f"/api/v1/workspaces/{workspace}/invites/{sent.json()['id']}")
    client.cookies.clear()
    revoked = client.get(f"/api/v1/invites/{token}")

    accounts.acting_as(alice)
    invite(client, workspace, "cara@example.com", "viewer")
    expired_token = token_of(mailer)
    client.cookies.clear()
    clock.advance(timedelta(days=7, seconds=1))
    expired = client.get(f"/api/v1/invites/{expired_token}")

    assert pending.status_code == 200
    assert pending.json() == {
        "workspace_name": "Studio",
        "role": "editor",
        "email": "bob@example.com",
    }
    assert unknown.status_code == 404
    assert revoked.status_code == 404
    assert expired.status_code == 410


def test_accepting_unauthenticated_creates_the_user_signs_them_in_and_joins(
    client: TestClient, accounts: Accounts, mailer: RecordingMailer
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    invite(client, workspace, "bob@example.com", "editor")
    token = token_of(mailer)
    client.cookies.clear()

    accepted = client.post(f"/api/v1/invites/{token}/accept")
    me = client.get("/api/v1/me")

    assert accepted.status_code == 204
    assert accepted.headers.get("set-cookie")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "bob@example.com"
    assert me.json()["memberships"] == [
        {
            "workspace": {"id": workspace, "name": "Studio"},
            "role": "editor",
        }
    ]
    assert me.json()["user"]["id"] != alice.id


def test_accepting_replaces_whatever_session_the_caller_already_holds(
    client: TestClient, accounts: Accounts, mailer: RecordingMailer
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    invite(client, workspace, "bob@example.com", "viewer")
    token = token_of(mailer)
    accounts.acting_as(alice)

    accepted = client.post(f"/api/v1/invites/{token}/accept")
    me = client.get("/api/v1/me")
    client.cookies.clear()
    client.cookies.set("media_canvas_session", alice.token)
    as_alice = client.get("/api/v1/me")

    assert accepted.status_code == 204
    assert me.json()["user"]["email"] == "bob@example.com"
    assert as_alice.status_code == 401


def test_an_invite_is_single_use_and_expires_after_seven_days(
    client: TestClient,
    accounts: Accounts,
    mailer: RecordingMailer,
    clock: FakeClock,
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    invite(client, workspace, "bob@example.com", "editor")
    token = token_of(mailer)
    client.cookies.clear()

    first = client.post(f"/api/v1/invites/{token}/accept")
    replayed = client.post(f"/api/v1/invites/{token}/accept")
    used = client.get(f"/api/v1/invites/{token}")

    accounts.acting_as(alice)
    sent = invite(client, workspace, "cara@example.com", "viewer")
    revoked_token = token_of(mailer)
    client.delete(f"/api/v1/workspaces/{workspace}/invites/{sent.json()['id']}")
    invite(client, workspace, "drew@example.com", "viewer")
    expired_token = token_of(mailer)
    client.cookies.clear()
    clock.advance(timedelta(days=7, seconds=1))

    revoked = client.post(f"/api/v1/invites/{revoked_token}/accept")
    unknown = client.post("/api/v1/invites/not-a-token/accept")
    expired = client.post(f"/api/v1/invites/{expired_token}/accept")

    assert first.status_code == 204
    assert replayed.status_code == 404
    assert used.status_code == 404
    assert revoked.status_code == 404
    assert unknown.status_code == 404
    assert expired.status_code == 410


def test_accepting_attaches_the_membership_to_an_existing_user(
    client: TestClient, accounts: Accounts, mailer: RecordingMailer
) -> None:
    bob = accounts.sign_in("bob@example.com")
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    invite(client, workspace, "bob@example.com", "editor")
    token = token_of(mailer)
    client.cookies.clear()

    accepted = client.post(f"/api/v1/invites/{token}/accept")
    me = client.get("/api/v1/me")

    assert accepted.status_code == 204
    assert me.json()["user"]["id"] == bob.id
    assert me.json()["user"]["email"] == "bob@example.com"
    assert me.json()["memberships"] == [
        {
            "workspace": {"id": workspace, "name": "Studio"},
            "role": "editor",
        }
    ]
    accounts.acting_as(alice)
    assert client.get("/api/v1/me").json()["user"]["id"] == alice.id


def token_of(mailer: RecordingMailer) -> str:
    return mailer.invites[-1].accept_url.rsplit("/", 1)[-1]


def a_workspace(client: TestClient, name: str = "Studio") -> str:
    created = client.post("/api/v1/workspaces", json={"name": name})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def owned_workspace(client: TestClient, accounts: Accounts, owner: Account) -> str:
    accounts.acting_as(owner)
    return a_workspace(client)


def invite(client: TestClient, workspace: str, email: str, role: str) -> Response:
    return client.post(
        f"/api/v1/workspaces/{workspace}/invites",
        json={"email": email, "role": role},
    )
