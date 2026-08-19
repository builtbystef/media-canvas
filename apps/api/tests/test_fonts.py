"""Font Asset upload: the hash that identifies it, and the gate it passes.

Every claim is made at the HTTP seam the editor uses. Object storage is the
real one the compose file starts; the worker's inspection is faked behind its
contract, because the parser's own judgment is the worker's test to make and
the api never opens a font file itself.
"""

from typing import Any

import pytest
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from conftest import Accounts, Join
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
