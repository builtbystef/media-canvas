"""Font Asset upload: the hash that identifies it, and the gate it passes.

Every claim is made at the HTTP seam the editor uses. Object storage is the
real one the compose file starts; the worker's inspection is faked behind its
contract, because the parser's own judgment is the worker's test to make and
the api never opens a font file itself.
"""

from datetime import timedelta
from typing import Any

import pytest
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from conftest import Accounts, FakeClock, Join
from fastapi.testclient import TestClient
from media_canvas_api.storage import Bucket, ObjectStore
from media_canvas_api.worker import RecordingWorker
from sqlalchemy import Engine, text

A_FONT = b"\x00\x01\x00\x00 the bytes of a font file"


def a_workspace(client: TestClient, name: str = "Studio") -> str:
    created = client.post("/api/v1/workspaces", json={"name": name})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def upload(
    client: TestClient,
    workspace: str,
    font: bytes = A_FONT,
    filename: str = "Inter-Regular.ttf",
) -> Any:
    return client.post(
        f"/api/v1/workspaces/{workspace}/fonts",
        files={"file": (filename, font, "font/ttf")},
    )


def test_an_uploaded_font_is_recorded_as_what_the_parser_read_in_it(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    worker.reads(
        family="Inter",
        subfamily="Bold Italic",
        weight=700,
        italic=True,
        post_script_name="Inter-BoldItalic",
    )

    created = upload(client, workspace)

    assert created.status_code == 201, created.text
    record = created.json()
    assert record.pop("createdAt")
    assert record == {
        "id": record["id"],
        "format": "ttf",
        "family": "Inter",
        "subfamily": "Bold Italic",
        "weight": 700,
        "italic": True,
        "postscriptName": "Inter-BoldItalic",
        "byteSize": len(A_FONT),
        "bundled": False,
        "originalFilename": "Inter-Regular.ttf",
        "url": f"/api/v1/workspaces/{workspace}/fonts/{record['id']}.ttf",
    }


def test_the_font_the_editor_gets_back_is_the_font_that_reached_storage(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(client, workspace)

    stored = objects.assets.open(f"{workspace}/fonts/{created.json()['id']}.ttf")
    assert stored is not None
    assert stored.read() == A_FONT
    assert stored.content_type == "font/ttf"


def test_a_font_is_identified_by_its_bytes_so_two_workspaces_hold_it_twice(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    one = a_workspace(client, "Studio")
    other = a_workspace(client, "Agency")

    here = upload(client, one)
    there = upload(client, other)

    assert here.json()["id"] == there.json()["id"]
    assert there.status_code == 201, there.text
    for workspace in (one, other):
        assert (
            objects.assets.open(f"{workspace}/fonts/{here.json()['id']}.ttf")
            is not None
        )


def test_uploading_bytes_the_workspace_already_holds_returns_what_it_holds(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    first = upload(client, workspace)
    again = upload(client, workspace, filename="a-second-name.ttf")

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json() == first.json()
    assert len(worker.inspections) == 1


def test_a_web_font_is_refused_with_the_advice_to_convert_it(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    worker.refuses("unsupported_format")

    refused = upload(client, workspace, font=b"wOF2 a web font", filename="Inter.woff2")

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "unsupported_format"
    assert "TTF" in refused.json()["error"]["message"]
    assert nothing_stored(client, s3)


def test_a_variable_font_is_refused_with_the_advice_to_export_static_instances(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    worker.reads(variable=True)

    refused = upload(client, workspace, filename="Inter-Variable.ttf")

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "variable_font"
    assert "static" in refused.json()["error"]["message"]
    assert nothing_stored(client, s3)


def test_a_file_the_parser_cannot_read_is_refused_for_that_and_not_its_format(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    worker.refuses("unparseable_font")

    refused = upload(client, workspace, font=b"\x00\x01\x00\x00 half a font")

    assert refused.json()["error"]["code"] == "unparseable_font"
    assert nothing_stored(client, s3)


def test_a_font_past_the_size_limit_is_refused_without_being_inspected(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = upload(client, workspace, font=b"\x00" * (10 * 1024 * 1024 + 1))

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "file_too_large"
    assert worker.inspections == []
    assert nothing_stored(client, s3)


def nothing_stored(client: TestClient, s3: BaseClient) -> bool:
    """Whether the assets bucket is as empty as it was before the upload.

    A refused font reaches storage at no point — there is no quarantine area
    and nothing to sweep later — so the claim is about the whole bucket rather
    than about one key.
    """
    bucket = client.app.state.settings.assets_bucket
    return "Contents" not in s3.list_objects_v2(Bucket=bucket)


def test_uploading_a_font_takes_an_editor_and_a_viewer_is_refused(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    owner = accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)
    watcher = accounts.sign_in("watcher@example.com")
    joining(workspace, watcher, "viewer")

    accounts.acting_as(watcher)
    refused = upload(client, workspace)
    accounts.acting_as(owner)
    allowed = upload(client, workspace)

    assert refused.status_code == 403
    assert allowed.status_code == 201


def test_somebody_outside_the_workspace_is_told_only_that_there_is_no_such_workspace(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)

    accounts.sign_in("stranger@example.com")
    refused = upload(client, workspace)

    assert refused.status_code == 404
    assert refused.json() == {"detail": "No such workspace."}


def test_a_font_whose_bytes_could_not_be_stored_leaves_no_record_behind(
    client: TestClient,
    accounts: Accounts,
    stored: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The object goes first and the row second, so an upload that fails
    part-way leaves bytes nothing points at rather than a record of a font
    that cannot be served."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    def refuse(*_: object) -> None:
        raise ClientError({"Error": {"Code": "InternalError"}}, "PutObject")

    monkeypatch.setattr(Bucket, "put", refuse)
    with pytest.raises(ClientError):
        upload(client, workspace)

    with stored.begin() as connection:
        assert (
            connection.execute(text("SELECT count(*) FROM font_assets")).scalar() == 0
        )


def test_a_font_is_served_from_its_own_address_as_the_type_it_was_stored_as(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()

    served = client.get(font["url"])

    assert served.status_code == 200, served.text
    assert served.content == A_FONT
    assert served.headers["content-type"] == "font/ttf"


def test_the_suffix_on_a_serving_address_is_cosmetic_and_never_looked_at(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    address = f"/api/v1/workspaces/{workspace}/fonts/{font['id']}"

    bare = client.get(address)
    suffixed = client.get(f"{address}.ttf")
    invented = client.get(f"{address}.woff2")

    assert bare.content == suffixed.content == invented.content == A_FONT


def test_served_bytes_are_kept_by_the_one_browser_that_was_allowed_them(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    served = client.get(upload(client, workspace).json()["url"])

    assert served.headers["cache-control"] == "private, max-age=31536000, immutable"


def test_a_request_with_no_session_receives_no_asset_bytes(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()

    client.cookies.clear()
    anonymous = client.get(font["url"])

    assert anonymous.status_code == 401
    assert font["id"] not in anonymous.text


def test_fetching_a_font_is_open_to_a_viewer_and_closed_to_an_outsider(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    watcher = accounts.sign_in("watcher@example.com")
    joining(workspace, watcher, "viewer")

    accounts.acting_as(watcher)
    allowed = client.get(font["url"])
    accounts.sign_in("stranger@example.com")
    refused = client.get(font["url"])

    assert allowed.status_code == 200
    assert allowed.content == A_FONT
    assert refused.status_code == 404
    assert refused.json() == {"detail": "No such workspace."}


ANOTHER_FONT = b"\x00\x01\x00\x00 the bytes of a second font file"


def test_the_font_list_is_this_workspace_s_own_records_newest_first(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    elsewhere = a_workspace(client, "Agency")
    first = upload(client, workspace).json()
    clock.advance(timedelta(minutes=1))
    second = upload(client, workspace, font=ANOTHER_FONT).json()
    upload(client, elsewhere)

    listed = client.get(f"/api/v1/workspaces/{workspace}/fonts")

    assert listed.status_code == 200, listed.text
    assert listed.json() == [second, first]


def test_a_listed_font_says_whether_it_came_with_the_product(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    mine = upload(client, workspace).json()
    theirs = upload(client, workspace, font=ANOTHER_FONT).json()
    mark_bundled(stored, workspace, theirs["id"])

    listed = client.get(f"/api/v1/workspaces/{workspace}/fonts").json()

    assert {record["id"]: record["bundled"] for record in listed} == {
        mine["id"]: False,
        theirs["id"]: True,
    }


def mark_bundled(stored: Engine, workspace: str, font_id: str) -> None:
    """Make a font one that came with the product, directly.

    Seeding the vendored families into a new Workspace is a slice of its own
    (vn4r07, under the deployment spec); until it exists, a test that needs a
    bundled font marks one. Arrangement only — every claim is still made at
    the HTTP seam.
    """
    with stored.begin() as connection:
        connection.execute(
            text(
                "UPDATE font_assets SET bundled = true"
                " WHERE workspace_id = :workspace AND id = :font"
            ),
            {"workspace": workspace, "font": font_id},
        )


def test_deleting_a_font_takes_its_record_and_its_bytes_away(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()

    deleted = client.delete(font["url"])

    assert deleted.status_code == 204, deleted.text
    assert client.get(f"/api/v1/workspaces/{workspace}/fonts").json() == []
    assert client.get(font["url"]).status_code == 404
    assert objects.assets.open(f"{workspace}/fonts/{font['id']}.ttf") is None


def test_uploading_deleted_bytes_again_brings_the_font_back_at_the_same_id(
    client: TestClient, accounts: Accounts
) -> None:
    """Nothing is tombstoned (ADR-0007), so the same bytes reach the same id
    and every document that referenced it renders again."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    client.delete(font["url"])

    again = upload(client, workspace)

    assert again.status_code == 201, again.text
    assert again.json() == font
    assert client.get(font["url"]).content == A_FONT


def test_a_font_that_came_with_the_product_refuses_to_be_deleted(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    mark_bundled(stored, workspace, font["id"])

    refused = client.delete(font["url"])

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "asset_is_bundled"
    assert objects.assets.open(f"{workspace}/fonts/{font['id']}.ttf") is not None


def test_deleting_a_font_takes_an_editor_and_a_viewer_is_refused(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    owner = accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    watcher = accounts.sign_in("watcher@example.com")
    joining(workspace, watcher, "viewer")

    accounts.acting_as(watcher)
    refused = client.delete(font["url"])
    accounts.acting_as(owner)
    allowed = client.delete(font["url"])

    assert refused.status_code == 403
    assert allowed.status_code == 204


def test_deleting_a_font_the_workspace_never_held_is_no_such_font(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    missing = client.delete(f"/api/v1/workspaces/{workspace}/fonts/{'0' * 64}.ttf")

    assert missing.status_code == 404
    assert missing.json() == {"detail": "No such font."}


def test_a_font_whose_bytes_outlive_the_delete_leaves_no_record_behind(
    client: TestClient,
    accounts: Accounts,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The row goes first and the object second, so a delete that fails
    part-way leaves bytes nothing points at rather than a record of a font
    whose bytes are gone."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()

    def refuse(*_: object) -> None:
        raise ClientError({"Error": {"Code": "InternalError"}}, "DeleteObject")

    monkeypatch.setattr(Bucket, "delete", refuse)
    with pytest.raises(ClientError):
        client.delete(font["url"])

    monkeypatch.undo()
    assert client.get(f"/api/v1/workspaces/{workspace}/fonts").json() == []


def test_a_font_a_document_references_deletes_like_any_other(
    client: TestClient, accounts: Accounts
) -> None:
    """Nothing counts references, before or during the delete (ADR-0007): the
    document keeps the id it named, and fails loudly until the same bytes come
    back."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    font = upload(client, workspace).json()
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={
            "kind": "design",
            "name": "Poster",
            "document": {
                "schemaVersion": 1,
                "canvas": {"width": 100, "height": 100, "background": "#ffffff"},
                "elements": [{"id": "a", "type": "text", "fontAssetId": font["id"]}],
            },
        },
    ).json()

    deleted = client.delete(font["url"])

    assert deleted.status_code == 204, deleted.text
    reread = client.get(f"/api/v1/documents/{design['id']}").json()
    assert reread["document"]["elements"][0]["fontAssetId"] == font["id"]
