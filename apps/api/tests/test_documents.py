"""The documents surface: the table, the endpoints, and promotion.

Every claim is made at the HTTP seam — the api's contract with the editor —
because the storage of an opaque document is only observable through what
comes back out of it.
"""

from datetime import timedelta
from typing import Any
from uuid import uuid4

from conftest import Accounts, FakeClock, Join
from fastapi.testclient import TestClient


def a_design(width: int = 1080, height: int = 1080) -> dict[str, Any]:
    """A Design Document the api will never look inside."""
    return {
        "schemaVersion": 1,
        "canvas": {"width": width, "height": height, "background": "#ffffff"},
        "elements": [],
    }


def a_workspace(client: TestClient) -> str:
    created = client.post("/api/v1/workspaces", json={"name": "Studio"})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def test_a_created_design_comes_back_whole_at_its_own_address(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Untitled", "document": a_design()},
    )
    fetched = client.get(f"/api/v1/documents/{created.json()['id']}")

    assert created.status_code == 201, created.text
    assert fetched.status_code == 200
    assert fetched.json() == created.json()
    stored = fetched.json()
    assert (stored.pop("id"), stored.pop("createdAt")) == (
        created.json()["id"],
        stored["updatedAt"],
    )
    assert stored.pop("updatedAt")
    assert stored == {
        "kind": "design",
        "name": "Untitled",
        "schemaVersion": 1,
        "revision": 1,
        "promotedFromId": None,
        "workspaceId": workspace,
        "document": a_design(),
    }


def test_a_document_names_the_workspace_it_belongs_to_and_a_list_row_does_not(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    other = a_workspace(client)

    created = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Untitled", "document": a_design()},
    )
    fetched = client.get(f"/api/v1/documents/{created.json()['id']}")
    listed = client.get(f"/api/v1/workspaces/{workspace}/documents")
    promoted = client.post(f"/api/v1/documents/{created.json()['id']}/promote")

    assert created.status_code == 201
    assert fetched.status_code == 200
    assert created.json()["workspaceId"] == workspace
    assert fetched.json()["workspaceId"] == workspace
    assert fetched.json()["workspaceId"] != other
    assert promoted.json()["workspaceId"] == workspace
    assert "workspaceId" not in listed.json()[0]


def test_a_save_states_the_revision_it_loaded_and_a_stale_one_changes_nothing(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    document = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Poster", "document": a_design()},
    ).json()["id"]
    for revision, width in enumerate((200, 300, 400), start=1):
        saved = client.put(
            f"/api/v1/documents/{document}",
            json={"document": a_design(width), "revision": revision},
        )
        assert saved.status_code == 200, saved.text

    first = client.put(
        f"/api/v1/documents/{document}",
        json={"document": a_design(500), "revision": 4},
    )
    clock.advance(timedelta(minutes=1))
    second = client.put(
        f"/api/v1/documents/{document}",
        json={"document": a_design(600), "revision": 4},
    )
    stored = client.get(f"/api/v1/documents/{document}").json()

    assert (first.status_code, second.status_code) == (200, 409)
    assert first.json()["revision"] == 5
    assert (stored["revision"], stored["document"]) == (5, a_design(500))
    assert stored["updatedAt"] == first.json()["updatedAt"]


def test_promoting_a_design_twice_yields_two_templates_that_change_apart(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Spring sale", "document": a_design()},
    ).json()["id"]

    one = client.post(f"/api/v1/documents/{design}/promote").json()
    two = client.post(f"/api/v1/documents/{design}/promote").json()
    client.put(
        f"/api/v1/documents/{one['id']}",
        json={"document": a_design(640), "revision": 1, "name": "Renamed"},
    )
    again = client.post(f"/api/v1/documents/{one['id']}/promote")

    assert one["id"] != two["id"]
    assert (one["kind"], one["revision"], one["promotedFromId"]) == (
        "template",
        1,
        design,
    )
    assert one["name"] == two["name"] == "Spring sale"
    renamed = client.get(f"/api/v1/documents/{one['id']}").json()
    assert (renamed["name"], renamed["revision"]) == ("Renamed", 2)
    for untouched in (two["id"], design):
        assert client.get(f"/api/v1/documents/{untouched}").json()["document"] == (
            a_design()
        )
    assert again.status_code == 422


def test_deleting_the_design_a_template_came_from_leaves_the_template_standing(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Spring sale", "document": a_design()},
    ).json()["id"]
    template = client.post(f"/api/v1/documents/{design}/promote").json()["id"]

    deleted = client.delete(f"/api/v1/documents/{design}")

    assert deleted.status_code == 204
    assert client.get(f"/api/v1/documents/{design}").status_code == 404
    surviving = client.get(f"/api/v1/documents/{template}")
    assert surviving.status_code == 200
    assert surviving.json()["promotedFromId"] is None
    assert surviving.json()["document"] == a_design()


def test_the_list_filters_by_kind_drops_the_body_and_puts_the_newest_change_first(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    documents = f"/api/v1/workspaces/{workspace}/documents"
    first = client.post(
        documents, json={"kind": "design", "name": "One", "document": a_design()}
    ).json()["id"]
    clock.advance(timedelta(minutes=1))
    second = client.post(
        documents, json={"kind": "design", "name": "Two", "document": a_design()}
    ).json()["id"]
    clock.advance(timedelta(minutes=1))
    client.post(f"/api/v1/documents/{first}/promote")
    clock.advance(timedelta(minutes=1))
    client.put(
        f"/api/v1/documents/{second}", json={"document": a_design(), "revision": 1}
    )

    listed = client.get(documents)
    templates = client.get(documents, params={"kind": "template"})
    designs = client.get(documents, params={"kind": "design"})

    assert [(row["name"], row["kind"]) for row in listed.json()] == [
        ("Two", "design"),
        ("One", "template"),
        ("One", "design"),
    ]
    assert [row["name"] for row in templates.json()] == ["One"]
    assert [row["name"] for row in designs.json()] == ["Two", "One"]
    assert "document" not in listed.json()[0]


def test_a_viewer_reads_every_document_and_changes_none_of_them(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    viewer = accounts.sign_in("viewer@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    documents = f"/api/v1/workspaces/{workspace}/documents"
    design = client.post(
        documents, json={"kind": "design", "name": "One", "document": a_design()}
    ).json()["id"]
    joining(workspace, viewer, "viewer")

    accounts.acting_as(viewer)
    read = client.get(f"/api/v1/documents/{design}")
    listed = client.get(documents)
    refusals = {
        "create": client.post(
            documents, json={"kind": "design", "name": "Mine", "document": a_design()}
        ).status_code,
        "save": client.put(
            f"/api/v1/documents/{design}",
            json={"document": a_design(), "revision": 1, "name": "Renamed"},
        ).status_code,
        "promote": client.post(f"/api/v1/documents/{design}/promote").status_code,
        "delete": client.delete(f"/api/v1/documents/{design}").status_code,
    }

    assert (read.status_code, len(listed.json())) == (200, 1)
    assert refusals == {"create": 403, "save": 403, "promote": 403, "delete": 403}
    accounts.acting_as(alice)
    assert client.get(f"/api/v1/documents/{design}").json()["name"] == "One"


def test_an_outsider_cannot_tell_a_document_from_one_that_does_not_exist(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    outsider = accounts.sign_in("outsider@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "One", "document": a_design()},
    ).json()["id"]

    accounts.acting_as(outsider)
    answers = {
        f"/api/v1/documents/{whichever}": (
            client.get(f"/api/v1/documents/{whichever}"),
            client.put(
                f"/api/v1/documents/{whichever}",
                json={"document": a_design(), "revision": 1},
            ),
            client.post(f"/api/v1/documents/{whichever}/promote"),
            client.delete(f"/api/v1/documents/{whichever}"),
        )
        for whichever in (design, uuid4())
    }

    real, imaginary = answers.values()
    assert [(answer.status_code, answer.json()) for answer in real] == [
        (answer.status_code, answer.json()) for answer in imaginary
    ]
    assert {answer.status_code for answer in real} == {404}


def test_the_api_stores_and_returns_a_document_it_could_not_possibly_understand(
    client: TestClient, accounts: Accounts
) -> None:
    """Elements, Variables and tokens are the core's business, never the api's.

    Nothing below is valid to `@media-canvas/core`, and every route still has
    to hand it back exactly as it arrived.
    """
    opaque = {
        "schemaVersion": 1,
        "variables": [{"name": "Price", "type": "money-from-the-future"}],
        "elements": [
            {"id": "a", "type": "not-an-element", "content": "Now {{Price}}!"},
            {"id": "b", "type": "group", "children": [], "fill": {"$var": "Nothing"}},
        ],
        "éléments": [None, True, 1.5, [], {}],
    }
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Opaque", "document": opaque},
    )
    document = created.json()["id"]
    client.put(
        f"/api/v1/documents/{document}", json={"document": opaque, "revision": 1}
    )
    promoted = client.post(f"/api/v1/documents/{document}/promote")

    assert created.status_code == 201
    assert client.get(f"/api/v1/documents/{document}").json()["document"] == opaque
    assert promoted.json()["document"] == opaque


def test_a_document_without_a_schema_version_is_not_a_document(
    client: TestClient, accounts: Accounts
) -> None:
    """The one key the api reads, and the one thing it refuses over.

    `schemaVersion` is denormalized into a column so an operational question
    never has to open a document, so it has to be there to be denormalized.
    """
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "One", "document": {"elements": []}},
    )

    assert refused.status_code == 422
    assert client.get(f"/api/v1/workspaces/{workspace}/documents").json() == []


def test_deleting_a_workspace_takes_its_documents_and_their_lineage_with_it(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "One", "document": a_design()},
    ).json()["id"]
    template = client.post(f"/api/v1/documents/{design}/promote").json()["id"]

    closed = client.delete(f"/api/v1/workspaces/{workspace}")

    assert closed.status_code == 204
    assert client.get(f"/api/v1/documents/{design}").status_code == 404
    assert client.get(f"/api/v1/documents/{template}").status_code == 404
