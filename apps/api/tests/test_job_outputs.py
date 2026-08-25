"""Output delivery: per-Row files and the Job archive.

Every claim is made at the public HTTP seam. A succeeded Row is arranged
in the tables because the public surface cannot produce one by itself.
Bytes go into the real object store the compose stack starts.
"""

from io import BytesIO
from typing import Any
from uuid import uuid4
from zipfile import ZipFile

from conftest import Accounts, Join
from fastapi.testclient import TestClient
from media_canvas_api.settings import Settings
from media_canvas_api.storage import ObjectStore
from sqlalchemy import Engine, text


def a_document() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "canvas": {"width": 1080, "height": 1080, "background": "#ffffff"},
        "elements": [],
    }


def a_workspace(client: TestClient) -> str:
    created = client.post("/api/v1/workspaces", json={"name": "Studio"})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def a_template(client: TestClient, workspace: str) -> str:
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={
            "kind": "design",
            "name": "Spring sale",
            "document": a_document(),
        },
    )
    assert design.status_code == 201, design.text
    promoted = client.post(f"/api/v1/documents/{design.json()['id']}/promote")
    assert promoted.status_code == 201, promoted.text
    template: str = promoted.json()["id"]
    return template


def submit(
    client: TestClient,
    template: str,
    rows: list[dict[str, Any]],
    output: dict[str, Any] | None = None,
) -> Any:
    return client.post(
        f"/api/v1/templates/{template}/jobs",
        json={"rows": rows, "output": output or {"format": "png", "scale": 1}},
    )


def mark(
    stored: Engine,
    job_id: str,
    name: str,
    status: str,
    key: str | None = None,
) -> None:
    with stored.begin() as connection:
        connection.execute(
            text(
                "UPDATE generation_rows"
                " SET status = CAST(:status AS row_status), output_key = :key"
                " WHERE job_id = CAST(:job AS uuid) AND name = :name"
            ),
            {"job": job_id, "name": name, "status": status, "key": key},
        )


def test_the_job_view_carries_an_address_only_for_each_succeeded_row(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))
    created = submit(
        client,
        template,
        [
            {"_name": "hero", "headline": "One"},
            {"_name": "card", "headline": "Two"},
            {"headline": "Three"},
        ],
        output={"format": "jpeg", "quality": 90},
    )
    job_id = created.json()["id"]
    mark(stored, job_id, "hero", "succeeded", key="ws/jobs/x/hero.jpeg")
    mark(stored, job_id, "card", "failed")
    mark(stored, job_id, "2", "skipped")

    polled = client.get(f"/api/v1/jobs/{job_id}")

    assert polled.status_code == 200, polled.text
    rows = {row["name"]: row for row in polled.json()["rows"]}
    assert rows["hero"]["url"] == f"/api/v1/jobs/{job_id}/outputs/hero.jpeg"
    assert "url" not in rows["card"]
    assert "url" not in rows["2"]


def test_a_succeeded_row_is_served_at_its_address_as_the_jobs_output_type(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
        output={"format": "png", "scale": 2},
    )
    job_id = created.json()["id"]
    key = f"{workspace}/jobs/{job_id}/hero.png"
    objects.outputs.put(key, b"png-bytes", content_type="application/octet-stream")
    mark(stored, job_id, "hero", "succeeded", key=key)

    first = client.get(f"/api/v1/jobs/{job_id}")
    address = first.json()["rows"][0]["url"]
    served = client.get(address)
    mark(stored, job_id, "1", "succeeded", key=f"{workspace}/jobs/{job_id}/1.png")
    later = client.get(f"/api/v1/jobs/{job_id}")

    assert address == f"/api/v1/jobs/{job_id}/outputs/hero.png"
    assert later.json()["rows"][0]["url"] == address
    assert served.status_code == 200, served.text
    assert served.headers["content-type"] == "image/png"
    assert served.content == b"png-bytes"


def test_a_row_name_that_contains_a_dot_still_resolves_to_its_file(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [{"_name": "hero.v2", "headline": "One"}],
        output={"format": "jpeg"},
    )
    job_id = created.json()["id"]
    key = f"{workspace}/jobs/{job_id}/hero.v2.jpeg"
    objects.outputs.put(key, b"jpeg-bytes", content_type="image/jpeg")
    mark(stored, job_id, "hero.v2", "succeeded", key=key)

    polled = client.get(f"/api/v1/jobs/{job_id}")
    served = client.get(polled.json()["rows"][0]["url"])

    assert polled.json()["rows"][0]["url"] == (
        f"/api/v1/jobs/{job_id}/outputs/hero.v2.jpeg"
    )
    assert served.status_code == 200, served.text
    assert served.headers["content-type"] == "image/jpeg"
    assert served.content == b"jpeg-bytes"


def test_a_row_that_is_not_succeeded_answers_not_found_at_its_would_be_address(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [
            {"_name": "hero", "headline": "One"},
            {"_name": "card", "headline": "Two"},
            {"_name": "aside", "headline": "Three"},
        ],
    )
    job_id = created.json()["id"]
    for name in ("hero", "card", "aside"):
        objects.outputs.put(
            f"{workspace}/jobs/{job_id}/{name}.png",
            b"bytes",
            content_type="image/png",
        )
    mark(stored, job_id, "card", "failed")
    mark(stored, job_id, "aside", "skipped")

    queued = client.get(f"/api/v1/jobs/{job_id}/outputs/hero.png")
    failed = client.get(f"/api/v1/jobs/{job_id}/outputs/card.png")
    skipped = client.get(f"/api/v1/jobs/{job_id}/outputs/aside.png")
    unknown = client.get(f"/api/v1/jobs/{job_id}/outputs/never.png")
    wrong_ext = client.get(f"/api/v1/jobs/{job_id}/outputs/hero.jpeg")

    assert queued.status_code == 404
    assert failed.status_code == 404
    assert skipped.status_code == 404
    assert unknown.status_code == 404
    assert wrong_ext.status_code == 404


def test_the_archive_holds_one_entry_per_succeeded_row(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [
            {"_name": "hero", "headline": "One"},
            {"_name": "card", "headline": "Two"},
            {"_name": "aside", "headline": "Three"},
        ],
        output={"format": "pdf"},
    )
    job_id = created.json()["id"]
    for name, body in (("hero", b"hero-pdf"), ("card", b"card-pdf")):
        key = f"{workspace}/jobs/{job_id}/{name}.pdf"
        objects.outputs.put(key, body, content_type="application/pdf")
        mark(stored, job_id, name, "succeeded", key=key)
    mark(stored, job_id, "aside", "failed")

    downloaded = client.get(f"/api/v1/jobs/{job_id}/outputs.zip")

    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.headers["content-type"] == "application/zip"
    archive = ZipFile(BytesIO(downloaded.content))
    assert archive.namelist() == ["hero.pdf", "card.pdf"]
    assert archive.read("hero.pdf") == b"hero-pdf"
    assert archive.read("card.pdf") == b"card-pdf"


def test_an_archive_of_a_job_with_no_succeeded_rows_is_a_valid_empty_archive(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    created = submit(
        client,
        a_template(client, a_workspace(client)),
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
    )
    job_id = created.json()["id"]
    mark(stored, job_id, "hero", "failed")

    downloaded = client.get(f"/api/v1/jobs/{job_id}/outputs.zip")

    assert downloaded.status_code == 200, downloaded.text
    archive = ZipFile(BytesIO(downloaded.content))
    assert archive.namelist() == []
    assert archive.testzip() is None


def test_any_member_may_download_and_an_outsider_cannot_tell_the_job_exists(
    client: TestClient,
    accounts: Accounts,
    joining: Join,
    stored: Engine,
    objects: ObjectStore,
) -> None:
    alice = accounts.sign_in("alice@example.com")
    viewer = accounts.sign_in("viewer@example.com")
    outsider = accounts.sign_in("outsider@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    created = submit(
        client, a_template(client, workspace), [{"_name": "hero", "headline": "One"}]
    )
    job_id = created.json()["id"]
    key = f"{workspace}/jobs/{job_id}/hero.png"
    objects.outputs.put(key, b"png-bytes", content_type="image/png")
    mark(stored, job_id, "hero", "succeeded", key=key)
    joining(workspace, viewer, "viewer")
    file_url = f"/api/v1/jobs/{job_id}/outputs/hero.png"
    zip_url = f"/api/v1/jobs/{job_id}/outputs.zip"
    missing = str(uuid4())

    accounts.acting_as(viewer)
    viewer_file = client.get(file_url)
    viewer_zip = client.get(zip_url)
    accounts.acting_as(outsider)
    outsider_answers = {
        "real-file": client.get(file_url),
        "fake-file": client.get(f"/api/v1/jobs/{missing}/outputs/hero.png"),
        "real-zip": client.get(zip_url),
        "fake-zip": client.get(f"/api/v1/jobs/{missing}/outputs.zip"),
    }

    assert viewer_file.status_code == 200
    assert viewer_file.content == b"png-bytes"
    assert viewer_zip.status_code == 200
    assert ZipFile(BytesIO(viewer_zip.content)).namelist() == ["hero.png"]
    assert (
        outsider_answers["real-file"].status_code,
        outsider_answers["real-file"].json(),
    ) == (
        outsider_answers["fake-file"].status_code,
        outsider_answers["fake-file"].json(),
    )
    assert outsider_answers["real-file"].status_code == 404
    assert (
        outsider_answers["real-zip"].status_code,
        outsider_answers["real-zip"].json(),
    ) == (
        outsider_answers["fake-zip"].status_code,
        outsider_answers["fake-zip"].json(),
    )
    assert outsider_answers["real-zip"].status_code == 404


def test_downloads_are_proxied_and_never_expose_storage(
    client: TestClient,
    accounts: Accounts,
    stored: Engine,
    objects: ObjectStore,
    settings: Settings,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client, a_template(client, workspace), [{"_name": "hero", "headline": "One"}]
    )
    job_id = created.json()["id"]
    key = f"{workspace}/jobs/{job_id}/hero.png"
    objects.outputs.put(key, b"png-bytes", content_type="image/png")
    mark(stored, job_id, "hero", "succeeded", key=key)

    polled = client.get(f"/api/v1/jobs/{job_id}")
    served = client.get(polled.json()["rows"][0]["url"])
    zipped = client.get(f"/api/v1/jobs/{job_id}/outputs.zip")

    leaked = (
        settings.storage_endpoint.encode(),
        settings.storage_access_key.encode(),
        settings.storage_secret_key.encode(),
        b"X-Amz-Signature",
        b"X-Amz-Credential",
        b"X-Amz-Algorithm",
    )
    for response in (polled, served, zipped):
        blob = response.content + str(response.headers).encode()
        for secret in leaked:
            assert secret not in blob
        assert "location" not in response.headers
    assert served.content == b"png-bytes"
    assert ZipFile(BytesIO(zipped.content)).read("hero.png") == b"png-bytes"
