"""Cancel and delete.

Every claim is made at the public HTTP seam. A succeeded Row is arranged
in the tables and the object store the same way output-delivery tests do,
because the public surface cannot produce one by itself. Late results
arrive through the worker's internal contract.
"""

from datetime import timedelta
from typing import Any
from uuid import uuid4

from conftest import Accounts, FakeClock, Join
from fastapi.testclient import TestClient
from media_canvas_api.storage import ObjectStore
from sqlalchemy import Engine, text


def as_the_worker(client: TestClient) -> dict[str, str]:
    client.cookies.clear()
    token: str = client.app.state.settings.internal_api_token
    return {"authorization": f"Bearer {token}"}


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


def submit(client: TestClient, template: str, rows: list[dict[str, Any]]) -> Any:
    return client.post(
        f"/api/v1/templates/{template}/jobs",
        json={"rows": rows, "output": {"format": "png", "scale": 1}},
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


def store_success(
    objects: ObjectStore,
    stored: Engine,
    workspace: str,
    job_id: str,
    name: str,
    body: bytes,
) -> str:
    key = f"{workspace}/jobs/{job_id}/{name}.png"
    objects.outputs.put(key, body, content_type="image/png")
    mark(stored, job_id, name, "succeeded", key=key)
    return key


def test_cancelling_skips_unstarted_rows_and_keeps_finished_files(
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
            {"headline": "Three"},
            {"headline": "Four"},
            {"headline": "Five"},
        ],
    )
    job_id = created.json()["id"]
    store_success(objects, stored, workspace, job_id, "hero", b"hero-bytes")
    store_success(objects, stored, workspace, job_id, "card", b"card-bytes")

    canceled = client.post(f"/api/v1/jobs/{job_id}/cancel")
    hero = client.get(f"/api/v1/jobs/{job_id}/outputs/hero.png")
    card = client.get(f"/api/v1/jobs/{job_id}/outputs/card.png")

    assert created.status_code == 201, created.text
    assert canceled.status_code == 200, canceled.text
    body = canceled.json()
    assert body["state"] == "canceled"
    assert body["progress"] == {
        "queued": 0,
        "rendering": 0,
        "succeeded": 2,
        "failed": 0,
        "skipped": 3,
    }
    statuses = {row["name"]: row["status"] for row in body["rows"]}
    assert statuses == {
        "hero": "succeeded",
        "card": "succeeded",
        "2": "skipped",
        "3": "skipped",
        "4": "skipped",
    }
    assert hero.status_code == 200
    assert hero.content == b"hero-bytes"
    assert card.status_code == 200
    assert card.content == b"card-bytes"


def row_id(stored: Engine, job_id: str, name: str) -> str:
    with stored.connect() as connection:
        found = connection.execute(
            text(
                "SELECT id FROM generation_rows"
                " WHERE job_id = CAST(:job AS uuid) AND name = :name"
            ),
            {"job": job_id, "name": name},
        ).scalar_one()
    return str(found)


def test_canceled_is_terminal_and_a_late_result_does_not_revive_it(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
    )
    job_id = created.json()["id"]
    store_success(objects, stored, workspace, job_id, "hero", b"hero-bytes")
    skipped_id = row_id(stored, job_id, "1")

    first = client.post(f"/api/v1/jobs/{job_id}/cancel")
    again = client.post(f"/api/v1/jobs/{job_id}/cancel")
    worker = as_the_worker(client)
    late = client.post(
        f"/internal/jobs/{job_id}/rows/{skipped_id}/result",
        headers=worker,
        json={"status": "succeeded", "outputKey": f"{workspace}/jobs/{job_id}/1.png"},
    )
    accounts.acting_as(alice)
    polled = client.get(f"/api/v1/jobs/{job_id}")

    assert first.status_code == 200, first.text
    assert again.status_code == 200, again.text
    assert again.json() == first.json()
    assert late.status_code == 204, late.text
    body = polled.json()
    assert body["state"] == "canceled"
    assert body["progress"]["skipped"] == 1
    assert body["progress"]["succeeded"] == 1
    assert {row["name"]: row["status"] for row in body["rows"]} == {
        "hero": "succeeded",
        "1": "skipped",
    }


def test_a_row_already_rendering_leaves_counts_consistent_however_it_finishes(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    alice = accounts.sign_in("alice@example.com")
    created = submit(
        client,
        a_template(client, a_workspace(client)),
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
    )
    job_id = created.json()["id"]
    rendering_id = row_id(stored, job_id, "hero")
    worker = as_the_worker(client)
    started = client.get(f"/internal/jobs/{job_id}/rows/{rendering_id}", headers=worker)
    accounts.acting_as(alice)
    canceled = client.post(f"/api/v1/jobs/{job_id}/cancel")
    worker = as_the_worker(client)
    late_success = client.post(
        f"/internal/jobs/{job_id}/rows/{rendering_id}/result",
        headers=worker,
        json={"status": "succeeded", "outputKey": "ws/jobs/x/hero.png"},
    )
    late_failure = client.post(
        f"/internal/jobs/{job_id}/rows/{rendering_id}/result",
        headers=worker,
        json={"status": "failed", "error": {"message": "too late"}},
    )
    accounts.acting_as(alice)
    polled = client.get(f"/api/v1/jobs/{job_id}")

    assert started.status_code == 200, started.text
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["state"] == "canceled"
    assert canceled.json()["progress"] == {
        "queued": 0,
        "rendering": 0,
        "succeeded": 0,
        "failed": 0,
        "skipped": 2,
    }
    assert late_success.status_code == 204, late_success.text
    assert late_failure.status_code == 204, late_failure.text
    assert polled.json()["state"] == "canceled"
    assert polled.json()["progress"] == canceled.json()["progress"]
    assert [row["status"] for row in polled.json()["rows"]] == ["skipped", "skipped"]


def keys_under(objects: ObjectStore, prefix: str) -> list[str]:
    found: list[str] = []
    pages = objects.outputs.client.get_paginator("list_objects_v2").paginate(
        Bucket=objects.outputs.name, Prefix=prefix
    )
    for page in pages:
        found.extend(stored["Key"] for stored in page.get("Contents", ()))
    return found


def test_deleting_a_job_removes_its_records_and_every_object_under_its_prefix(
    client: TestClient, accounts: Accounts, stored: Engine, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    doomed = submit(
        client,
        template,
        [{"_name": "hero", "headline": "One"}, {"_name": "card", "headline": "Two"}],
    )
    neighbour = submit(client, template, [{"_name": "aside", "headline": "Keep"}])
    doomed_id = doomed.json()["id"]
    neighbour_id = neighbour.json()["id"]
    store_success(objects, stored, workspace, doomed_id, "hero", b"hero-bytes")
    store_success(objects, stored, workspace, doomed_id, "card", b"card-bytes")
    store_success(objects, stored, workspace, neighbour_id, "aside", b"aside-bytes")
    doomed_prefix = f"{workspace}/jobs/{doomed_id}/"
    neighbour_key = f"{workspace}/jobs/{neighbour_id}/aside.png"

    deleted = client.delete(f"/api/v1/jobs/{doomed_id}")
    missing_job = client.get(f"/api/v1/jobs/{doomed_id}")
    missing_hero = client.get(f"/api/v1/jobs/{doomed_id}/outputs/hero.png")
    missing_card = client.get(f"/api/v1/jobs/{doomed_id}/outputs/card.png")
    neighbour_file = client.get(f"/api/v1/jobs/{neighbour_id}/outputs/aside.png")
    listed = client.get(f"/api/v1/workspaces/{workspace}/jobs")

    assert doomed.status_code == 201, doomed.text
    assert neighbour.status_code == 201, neighbour.text
    assert deleted.status_code == 204, deleted.text
    assert deleted.content == b""
    assert missing_job.status_code == 404
    assert missing_hero.status_code == 404
    assert missing_card.status_code == 404
    assert neighbour_file.status_code == 200
    assert neighbour_file.content == b"aside-bytes"
    assert [job["id"] for job in listed.json()] == [neighbour_id]
    assert keys_under(objects, doomed_prefix) == []
    assert objects.outputs.open(neighbour_key) is not None
    with stored.connect() as connection:
        leftover_jobs = connection.execute(
            text("SELECT count(*) FROM generation_jobs WHERE id = CAST(:id AS uuid)"),
            {"id": doomed_id},
        ).scalar_one()
        leftover_rows = connection.execute(
            text(
                "SELECT count(*) FROM generation_rows WHERE job_id = CAST(:id AS uuid)"
            ),
            {"id": doomed_id},
        ).scalar_one()
    assert (leftover_jobs, leftover_rows) == (0, 0)


def test_outputs_do_not_expire_when_time_passes(
    client: TestClient,
    accounts: Accounts,
    stored: Engine,
    objects: ObjectStore,
    clock: FakeClock,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    created = submit(
        client,
        a_template(client, workspace),
        [{"_name": "hero", "headline": "One"}],
    )
    job_id = created.json()["id"]
    store_success(objects, stored, workspace, job_id, "hero", b"hero-bytes")

    clock.advance(timedelta(days=400))
    accounts.sign_in("alice@example.com")
    polled = client.get(f"/api/v1/jobs/{job_id}")
    served = client.get(f"/api/v1/jobs/{job_id}/outputs/hero.png")

    assert created.status_code == 201, created.text
    assert polled.status_code == 200
    assert polled.json()["rows"][0]["status"] == "succeeded"
    assert served.status_code == 200
    assert served.content == b"hero-bytes"


def test_cancel_and_delete_are_editor_actions_and_hide_the_job_from_outsiders(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    alice = accounts.sign_in("alice@example.com")
    editor = accounts.sign_in("editor@example.com")
    viewer = accounts.sign_in("viewer@example.com")
    outsider = accounts.sign_in("outsider@example.com")
    accounts.acting_as(alice)
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    joining(workspace, editor, "editor")
    joining(workspace, viewer, "viewer")
    created = submit(client, template, [{"_name": "hero", "headline": "One"}])
    doomed = submit(client, template, [{"_name": "card", "headline": "Two"}])
    job = created.json()["id"]
    other = doomed.json()["id"]
    missing = uuid4()

    accounts.acting_as(viewer)
    viewer_cancel = client.post(f"/api/v1/jobs/{job}/cancel")
    viewer_delete = client.delete(f"/api/v1/jobs/{job}")
    accounts.acting_as(outsider)
    outsider_answers = {
        "real-cancel": client.post(f"/api/v1/jobs/{job}/cancel"),
        "fake-cancel": client.post(f"/api/v1/jobs/{missing}/cancel"),
        "real-delete": client.delete(f"/api/v1/jobs/{job}"),
        "fake-delete": client.delete(f"/api/v1/jobs/{missing}"),
    }
    accounts.acting_as(editor)
    canceled = client.post(f"/api/v1/jobs/{job}/cancel")
    deleted = client.delete(f"/api/v1/jobs/{other}")

    assert created.status_code == 201, created.text
    assert doomed.status_code == 201, doomed.text
    assert viewer_cancel.status_code == 403
    assert viewer_delete.status_code == 403
    assert (
        outsider_answers["real-cancel"].status_code,
        outsider_answers["real-cancel"].json(),
    ) == (
        outsider_answers["fake-cancel"].status_code,
        outsider_answers["fake-cancel"].json(),
    )
    assert outsider_answers["real-cancel"].status_code == 404
    assert (
        outsider_answers["real-delete"].status_code,
        outsider_answers["real-delete"].json(),
    ) == (
        outsider_answers["fake-delete"].status_code,
        outsider_answers["fake-delete"].json(),
    )
    assert outsider_answers["real-delete"].status_code == 404
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["state"] == "canceled"
    assert deleted.status_code == 204, deleted.text


def test_a_canceled_job_withdraws_unstarted_work_from_the_worker(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    created = submit(
        client,
        a_template(client, a_workspace(client)),
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
    )
    job_id = created.json()["id"]
    queued_id = row_id(stored, job_id, "1")
    canceled = client.post(f"/api/v1/jobs/{job_id}/cancel")
    fetched = client.get(
        f"/internal/jobs/{job_id}/rows/{queued_id}", headers=as_the_worker(client)
    )

    assert created.status_code == 201, created.text
    assert canceled.status_code == 200, canceled.text
    assert fetched.status_code == 404
