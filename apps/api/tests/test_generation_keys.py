"""API keys on the generation surface, at the public HTTP seam.

The accounts spec's first seam, and this issue's: a script holding only a
key, against the real generation routes.
"""

from io import BytesIO
from typing import Any
from uuid import uuid4
from zipfile import ZipFile

from conftest import Accounts, Join
from fastapi.testclient import TestClient
from media_canvas_api.sessions import COOKIE_NAME
from media_canvas_api.storage import ObjectStore
from media_canvas_api.worker import RecordingWorker
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
    design = a_design(client, workspace)
    promoted = client.post(f"/api/v1/documents/{design}/promote")
    assert promoted.status_code == 201, promoted.text
    template: str = promoted.json()["id"]
    return template


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


def a_design(client: TestClient, workspace: str) -> str:
    created = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Poster", "document": a_document()},
    )
    assert created.status_code == 201, created.text
    design: str = created.json()["id"]
    return design


def mint_key(client: TestClient, workspace: str) -> tuple[str, str]:
    minted = client.post(
        f"/api/v1/workspaces/{workspace}/api-keys", json={"name": "CI"}
    )
    assert minted.status_code == 201, minted.text
    return minted.json()["id"], minted.json()["key"]


def as_script(client: TestClient, key: str) -> dict[str, str]:
    """Drop the browser session: a script holds only the key."""
    client.cookies.clear()
    return {"authorization": f"Bearer {key}"}


def test_a_script_holding_only_a_key_renders_a_document_and_downloads_the_result(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = a_design(client, workspace)
    _, key = mint_key(client, workspace)
    headers = as_script(client, key)

    answered = client.post(
        f"/api/v1/documents/{design}/render",
        json={"output": {"format": "png", "scale": 1}},
        headers=headers,
    )

    assert COOKIE_NAME not in client.cookies
    assert "set-cookie" not in answered.headers
    assert answered.status_code == 200, answered.text
    assert answered.headers["content-type"] == "image/png"
    assert answered.content == worker.file


def test_a_key_authenticates_the_whole_generation_surface(
    client: TestClient,
    accounts: Accounts,
    worker: RecordingWorker,
    stored: Engine,
    objects: ObjectStore,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    _, key = mint_key(client, workspace)
    headers = as_script(client, key)

    rendered = client.post(
        f"/api/v1/documents/{template}/render",
        json={
            "values": {"headline": "Sale"},
            "output": {"format": "png", "scale": 1},
        },
        headers=headers,
    )
    submitted = client.post(
        f"/api/v1/templates/{template}/jobs",
        json={
            "rows": [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
            "output": {"format": "png", "scale": 1},
        },
        headers=headers,
    )
    job_id = submitted.json()["id"]
    output_key = f"{workspace}/jobs/{job_id}/hero.png"
    objects.outputs.put(output_key, b"png-bytes", content_type="image/png")
    mark(stored, job_id, "hero", "succeeded", key=output_key)
    polled = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    downloaded = client.get(f"/api/v1/jobs/{job_id}/outputs/hero.png", headers=headers)
    archive = client.get(f"/api/v1/jobs/{job_id}/outputs.zip", headers=headers)
    canceled = client.post(f"/api/v1/jobs/{job_id}/cancel", headers=headers)
    deleted = client.delete(f"/api/v1/jobs/{job_id}", headers=headers)

    assert rendered.status_code == 200, rendered.text
    assert rendered.content == worker.file
    assert submitted.status_code == 201, submitted.text
    assert polled.status_code == 200, polled.text
    assert polled.json()["rows"][0]["url"] == (
        f"/api/v1/jobs/{job_id}/outputs/hero.png"
    )
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.content == b"png-bytes"
    assert archive.status_code == 200, archive.text
    assert ZipFile(BytesIO(archive.content)).namelist() == ["hero.png"]
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["state"] == "canceled"
    assert deleted.status_code == 204, deleted.text


def test_a_key_from_another_workspace_does_not_disclose_whether_the_document_exists(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    studio = a_workspace(client)
    design = a_design(client, studio)
    accounts.sign_in("bob@example.com")
    other = a_workspace(client)
    _, key = mint_key(client, other)
    headers = as_script(client, key)
    missing = str(uuid4())

    real = client.post(
        f"/api/v1/documents/{design}/render",
        json={"output": {"format": "png", "scale": 1}},
        headers=headers,
    )
    fake = client.post(
        f"/api/v1/documents/{missing}/render",
        json={"output": {"format": "png", "scale": 1}},
        headers=headers,
    )

    assert (real.status_code, real.json()) == (fake.status_code, fake.json())
    assert real.status_code == 404


def test_a_key_is_refused_outside_the_generation_surface_and_unauthorized_once_revoked(
    client: TestClient, accounts: Accounts
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = a_design(client, workspace)
    key_id, key = mint_key(client, workspace)
    headers = as_script(client, key)
    render = f"/api/v1/documents/{design}/render"
    body = {"output": {"format": "png", "scale": 1}}

    members = client.get(f"/api/v1/workspaces/{workspace}/members", headers=headers)
    document = client.get(f"/api/v1/documents/{design}", headers=headers)
    permitted = client.post(render, json=body, headers=headers)

    accounts.acting_as(alice)
    revoked = client.delete(f"/api/v1/workspaces/{workspace}/api-keys/{key_id}")
    client.cookies.clear()
    reused = client.post(render, json=body, headers=headers)

    assert members.status_code == 403
    assert document.status_code == 403
    assert permitted.status_code == 200, permitted.text
    assert revoked.status_code == 204
    assert reused.status_code == 401


def test_a_viewer_cookie_is_refused_where_a_key_is_accepted(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    viewer = accounts.sign_in("viewer@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    joining(workspace, viewer, "viewer")
    _, key = mint_key(client, workspace)
    body = {
        "values": {"headline": "Sale"},
        "output": {"format": "png", "scale": 1},
    }

    accounts.acting_as(viewer)
    as_viewer = client.post(f"/api/v1/documents/{template}/render", json=body)
    headers = as_script(client, key)
    as_key = client.post(
        f"/api/v1/documents/{template}/render", json=body, headers=headers
    )

    assert as_viewer.status_code == 403
    assert as_key.status_code == 200, as_key.text
