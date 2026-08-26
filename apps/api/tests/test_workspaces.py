from typing import Any
from uuid import uuid4

from conftest import Account, Accounts, Join
from fastapi.testclient import TestClient


def test_creating_a_workspace_makes_the_caller_its_owner(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")

    created = client.post("/api/v1/workspaces", json={"name": "Studio"})

    assert created.status_code == 201
    assert created.json()["name"] == "Studio"
    assert client.get("/api/v1/me").json()["memberships"] == [
        {"workspace": created.json(), "role": "owner"}
    ]


def test_any_member_lists_the_members_and_only_an_owner_changes_who_is_in(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = a_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")

    accounts.acting_as(bob)
    listed = client.get(f"/api/v1/workspaces/{workspace}/members")
    demotion = client.patch(
        f"/api/v1/workspaces/{workspace}/members/{alice.id}", json={"role": "viewer"}
    )
    removal = client.delete(f"/api/v1/workspaces/{workspace}/members/{alice.id}")

    assert listed.status_code == 200
    assert [(member["user"]["email"], member["role"]) for member in listed.json()] == [
        ("alice@example.com", "owner"),
        ("bob@example.com", "editor"),
    ]
    assert (demotion.status_code, removal.status_code) == (403, 403)


def a_workspace(client: TestClient, accounts: Accounts, owner: Account) -> str:
    """A Workspace owned by `owner`, and its id."""
    accounts.acting_as(owner)
    created = client.post("/api/v1/workspaces", json={"name": "Studio"})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def test_the_last_owner_cannot_leave_until_there_is_another_one(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = a_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")

    alone = client.post(f"/api/v1/workspaces/{workspace}/leave")
    client.patch(
        f"/api/v1/workspaces/{workspace}/members/{bob.id}", json={"role": "owner"}
    )
    accompanied = client.post(f"/api/v1/workspaces/{workspace}/leave")

    assert (alone.status_code, accompanied.status_code) == (409, 204)
    assert client.get("/api/v1/me").json()["memberships"] == []
    accounts.acting_as(bob)
    assert [member["user"]["email"] for member in members(client, workspace)] == [
        "bob@example.com"
    ]


def test_the_last_owner_can_be_neither_demoted_nor_removed(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = a_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")

    demoted = client.patch(
        f"/api/v1/workspaces/{workspace}/members/{alice.id}", json={"role": "editor"}
    )
    removed = client.delete(f"/api/v1/workspaces/{workspace}/members/{alice.id}")

    assert (demoted.status_code, removed.status_code) == (409, 409)
    assert [member["role"] for member in members(client, workspace)] == [
        "owner",
        "editor",
    ]


def members(client: TestClient, workspace: str) -> list[Any]:
    listed = client.get(f"/api/v1/workspaces/{workspace}/members")
    assert listed.status_code == 200, listed.text
    members: list[Any] = listed.json()
    return members


def test_a_stranger_cannot_tell_a_real_workspace_from_one_that_never_existed(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client, accounts, alice)
    accounts.sign_in("mallory@example.com")

    real = client.get(f"/api/v1/workspaces/{workspace}/members")
    imaginary = client.get(f"/api/v1/workspaces/{uuid4()}/members")

    assert (real.status_code, real.json()) == (404, imaginary.json())


def test_renaming_and_deleting_belong_to_the_owner_alone(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = a_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")

    accounts.acting_as(bob)
    refused_rename = client.patch(
        f"/api/v1/workspaces/{workspace}", json={"name": "Bob's"}
    )
    refused_delete = client.delete(f"/api/v1/workspaces/{workspace}")
    accounts.acting_as(alice)
    renamed = client.patch(f"/api/v1/workspaces/{workspace}", json={"name": "Atelier"})

    assert (refused_rename.status_code, refused_delete.status_code) == (403, 403)
    assert renamed.status_code == 200
    assert client.get("/api/v1/me").json()["memberships"][0]["workspace"] == {
        "id": workspace,
        "name": "Atelier",
    }


def test_deleting_a_workspace_takes_every_row_that_belonged_to_it(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    bob = accounts.sign_in("bob@example.com")
    workspace = a_workspace(client, accounts, alice)
    joining(workspace, bob, "editor")

    deleted = client.delete(f"/api/v1/workspaces/{workspace}")

    assert deleted.status_code == 204
    assert client.get("/api/v1/me").json()["memberships"] == []
    accounts.acting_as(bob)
    assert client.get("/api/v1/me").json()["memberships"] == []
    assert workspace_scoped_answers(client, workspace, bob) == {404}


def workspace_scoped_answers(
    client: TestClient, workspace: str, someone: Account
) -> set[int]:
    """What every route that names a Workspace says about this one.

    Read from the schema rather than from a list written by hand, so a route
    added later is covered by whatever this is asserted to be.
    """
    return {
        client.request(
            method,
            path.replace("{workspaceId}", workspace)
            .replace("{userId}", someone.id)
            .replace("{inviteId}", someone.id),
            json={"name": "Anything", "role": "viewer"},
        ).status_code
        for path, operations in client.app.openapi()["paths"].items()
        if "{workspaceId}" in path
        for method in operations
    }
