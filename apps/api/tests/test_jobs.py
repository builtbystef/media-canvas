"""Job submission and polling.

Every claim is made at the public HTTP seam. The worker's validation
contract is stood in. The Template snapshot, and rows a refused batch
must not leave behind, are read from the tables because neither is on
the public JobView. Enqueue is observed in test_job_queue.py.
"""

from datetime import timedelta
from typing import Any
from uuid import uuid4

from conftest import Accounts, FakeClock, Join
from fastapi.testclient import TestClient
from media_canvas_api.worker import RecordingWorker, RowError
from sqlalchemy import Engine, text


def a_document(width: int = 1080) -> dict[str, Any]:
    """A Design Document the api will never look inside."""
    return {
        "schemaVersion": 1,
        "canvas": {"width": width, "height": width, "background": "#ffffff"},
        "elements": [],
    }


def a_workspace(client: TestClient) -> str:
    created = client.post("/api/v1/workspaces", json={"name": "Studio"})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def a_template(
    client: TestClient, workspace: str, document: dict[str, Any] | None = None
) -> str:
    design = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={
            "kind": "design",
            "name": "Spring sale",
            "document": document or a_document(),
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
    idempotency_key: str | None = None,
) -> Any:
    body: dict[str, Any] = {
        "rows": rows,
        "output": output or {"format": "png", "scale": 1},
    }
    if idempotency_key is not None:
        body["idempotencyKey"] = idempotency_key
    return client.post(f"/api/v1/templates/{template}/jobs", json=body)


def test_submitting_rows_stores_a_job_whose_snapshot_survives_the_template(
    client: TestClient,
    accounts: Accounts,
    worker: RecordingWorker,
    stored: Engine,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    original = a_document(1080)
    template = a_template(client, workspace, original)

    submitted = submit(client, template, [{"headline": "One"}, {"headline": "Two"}])
    job = submitted.json()
    edited = client.put(
        f"/api/v1/documents/{template}",
        json={"document": a_document(640), "revision": 1, "name": "Renamed"},
    )
    after_edit = client.get(f"/api/v1/jobs/{job['id']}")
    deleted = client.delete(f"/api/v1/documents/{template}")
    after_delete = client.get(f"/api/v1/jobs/{job['id']}")

    assert submitted.status_code == 201, submitted.text
    assert edited.status_code == 200, edited.text
    assert deleted.status_code == 204, deleted.text
    assert after_edit.json() == submitted.json()
    assert after_delete.json() == submitted.json()
    assert job["state"] == "queued"
    assert job["templateId"] == template
    assert job["output"] == {"format": "png", "scale": 1}
    assert job["progress"] == {
        "queued": 2,
        "rendering": 0,
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }
    assert job["rows"] == [
        {"index": 0, "name": "0", "status": "queued"},
        {"index": 1, "name": "1", "status": "queued"},
    ]
    assert len(worker.validations) == 1
    assert worker.validations[0].workspace_id == workspace
    assert worker.validations[0].template == original
    assert worker.validations[0].rows == [{"headline": "One"}, {"headline": "Two"}]
    with stored.connect() as connection:
        snapshot = connection.execute(
            text("SELECT template_snapshot FROM generation_jobs WHERE id = :id"),
            {"id": job["id"]},
        ).scalar_one()
    assert snapshot == original


def test_an_invalid_row_refuses_the_whole_batch_and_leaves_nothing_behind(
    client: TestClient,
    accounts: Accounts,
    worker: RecordingWorker,
    stored: Engine,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    worker.refuses_rows(
        RowError(row_index=1, variable="headline", message="headline is required")
    )

    refused = submit(
        client,
        template,
        [{"headline": "One"}, {}, {"headline": "Three"}],
    )

    assert refused.status_code == 422, refused.text
    assert refused.json()["errors"] == [
        {"rowIndex": 1, "variable": "headline", "message": "headline is required"}
    ]
    assert client.get(f"/api/v1/workspaces/{workspace}/jobs").json() == []
    with stored.connect() as connection:
        jobs = connection.execute(
            text("SELECT count(*) FROM generation_jobs")
        ).scalar_one()
        rows = connection.execute(
            text("SELECT count(*) FROM generation_rows")
        ).scalar_one()
    assert (jobs, rows) == (0, 0)


def test_two_rows_named_hero_are_refused_and_nothing_is_stored(
    client: TestClient,
    accounts: Accounts,
    worker: RecordingWorker,
    stored: Engine,
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)

    refused = submit(
        client,
        template,
        [{"_name": "hero", "headline": "One"}, {"_name": "hero", "headline": "Two"}],
    )

    assert refused.status_code == 422, refused.text
    assert refused.json()["errors"][0]["rowIndex"] == 1
    assert refused.json()["errors"][0]["variable"] == "_name"
    assert worker.validations == []
    with stored.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_jobs")
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_rows")
            ).scalar_one()
            == 0
        )


def test_a_row_without_a_name_takes_its_zero_padded_index(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))
    rows = [{"headline": str(i)} for i in range(11)]
    rows[3]["_name"] = "hero"

    submitted = submit(client, template, rows)

    assert submitted.status_code == 201, submitted.text
    assert [row["name"] for row in submitted.json()["rows"]] == [
        "00",
        "01",
        "02",
        "hero",
        "04",
        "05",
        "06",
        "07",
        "08",
        "09",
        "10",
    ]


def test_a_row_name_outside_the_charset_or_too_long_is_refused(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))

    space = submit(client, template, [{"_name": "hero shot", "headline": "One"}])
    long = submit(client, template, [{"_name": "h" * 129, "headline": "One"}])

    assert space.status_code == 422
    assert long.status_code == 422
    with stored.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_jobs")
            ).scalar_one()
            == 0
        )


def test_resubmitting_with_the_same_idempotency_key_returns_the_existing_job(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    first = submit(client, template, [{"headline": "One"}], idempotency_key="batch-1")
    again = submit(client, template, [{"headline": "Two"}], idempotency_key="batch-1")
    fresh = submit(client, template, [{"headline": "Three"}], idempotency_key="batch-2")
    other = a_template(client, workspace)
    elsewhere = submit(client, other, [{"headline": "Four"}], idempotency_key="batch-1")

    assert first.status_code == 201, first.text
    assert again.status_code == 200, again.text
    assert again.json() == first.json()
    assert fresh.status_code == 201, fresh.text
    assert fresh.json()["id"] != first.json()["id"]
    assert elsewhere.status_code == 201, elsewhere.text
    assert elsewhere.json()["id"] != first.json()["id"]
    assert len(worker.validations) == 3
    assert client.get(f"/api/v1/workspaces/{workspace}/jobs").json()[0]["id"] in {
        fresh.json()["id"],
        elsewhere.json()["id"],
        first.json()["id"],
    }
    assert len(client.get(f"/api/v1/workspaces/{workspace}/jobs").json()) == 3


def test_one_output_format_covers_the_whole_job(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))

    png = submit(client, template, [{"n": 1}], output={"format": "png", "scale": 2})
    jpeg = submit(client, template, [{"n": 1}], output={"format": "jpeg"})
    jpeg_q = submit(
        client, template, [{"n": 1}], output={"format": "jpeg", "quality": 75}
    )
    pdf = submit(client, template, [{"n": 1}], output={"format": "pdf"})
    unknown = submit(client, template, [{"n": 1}], output={"format": "gif"})

    assert png.json()["output"] == {"format": "png", "scale": 2}
    assert jpeg.json()["output"] == {"format": "jpeg", "quality": 90}
    assert jpeg_q.json()["output"] == {"format": "jpeg", "quality": 75}
    assert pdf.json()["output"] == {"format": "pdf"}
    assert unknown.status_code == 422


def test_polling_returns_state_output_counts_from_the_rows_and_each_row(
    client: TestClient, accounts: Accounts, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))
    created = submit(
        client,
        template,
        [{"_name": "hero", "headline": "One"}, {"headline": "Two"}],
        output={"format": "pdf"},
    )
    job_id = created.json()["id"]
    with stored.begin() as connection:
        connection.execute(
            text(
                "UPDATE generation_rows"
                " SET status = CAST('failed' AS row_status),"
                " error = CAST(:error AS jsonb)"
                " WHERE job_id = CAST(:job AS uuid) AND row_index = 1"
            ),
            {
                "job": job_id,
                "error": '{"variable": "photo", "message": "could not fetch"}',
            },
        )

    polled = client.get(f"/api/v1/jobs/{job_id}")

    assert polled.status_code == 200
    body = polled.json()
    assert body["state"] == "queued"
    assert body["output"] == {"format": "pdf"}
    assert body["progress"] == {
        "queued": 1,
        "rendering": 0,
        "succeeded": 0,
        "failed": 1,
        "skipped": 0,
    }
    assert body["rows"] == [
        {"index": 0, "name": "hero", "status": "queued"},
        {
            "index": 1,
            "name": "1",
            "status": "failed",
            "error": {"variable": "photo", "message": "could not fetch"},
        },
    ]
    assert "queued" not in body  # counts live under progress, not as columns


def test_a_workspace_lists_its_jobs_newest_first_without_row_detail(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    other = a_workspace(client)
    first = a_template(client, workspace)
    client.put(
        f"/api/v1/documents/{first}",
        json={"document": a_document(), "revision": 1, "name": "First template"},
    )
    older = submit(client, first, [{"n": 1}])
    clock.advance(timedelta(minutes=1))
    newer = submit(client, first, [{"n": 2}])
    other_template = a_template(client, other)
    elsewhere = submit(client, other_template, [{"n": 3}])

    listed = client.get(f"/api/v1/workspaces/{workspace}/jobs")
    other_list = client.get(f"/api/v1/workspaces/{other}/jobs")

    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [
        newer.json()["id"],
        older.json()["id"],
    ]
    assert "rows" not in listed.json()[0]
    assert listed.json()[0]["templateName"] == "First template"
    assert listed.json()[0]["progress"]["queued"] == 1
    assert [row["id"] for row in other_list.json()] == [elsewhere.json()["id"]]
    assert len(listed.json()) == 2


def test_submission_is_an_editor_action_and_reading_is_open_to_any_member(
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

    accounts.acting_as(editor)
    submitted = submit(client, template, [{"headline": "One"}])
    job = submitted.json()["id"]
    accounts.acting_as(viewer)
    viewer_read = client.get(f"/api/v1/jobs/{job}")
    viewer_list = client.get(f"/api/v1/workspaces/{workspace}/jobs")
    viewer_submit = submit(client, template, [{"headline": "Two"}])
    accounts.acting_as(outsider)
    missing = uuid4()
    outsider_answers = {
        "real-get": client.get(f"/api/v1/jobs/{job}"),
        "fake-get": client.get(f"/api/v1/jobs/{missing}"),
        "real-submit": submit(client, template, [{"headline": "Three"}]),
        "fake-submit": submit(client, str(missing), [{"headline": "Three"}]),
        "real-list": client.get(f"/api/v1/workspaces/{workspace}/jobs"),
        "fake-list": client.get(f"/api/v1/workspaces/{missing}/jobs"),
    }

    assert submitted.status_code == 201, submitted.text
    assert viewer_read.status_code == 200
    assert len(viewer_list.json()) == 1
    assert viewer_submit.status_code == 403
    assert (
        outsider_answers["real-get"].status_code,
        outsider_answers["real-get"].json(),
    ) == (
        outsider_answers["fake-get"].status_code,
        outsider_answers["fake-get"].json(),
    )
    assert outsider_answers["real-get"].status_code == 404
    assert (
        outsider_answers["real-submit"].status_code,
        outsider_answers["real-submit"].json(),
    ) == (
        outsider_answers["fake-submit"].status_code,
        outsider_answers["fake-submit"].json(),
    )
    assert outsider_answers["real-submit"].status_code == 404
    assert (
        outsider_answers["real-list"].status_code,
        outsider_answers["real-list"].json(),
    ) == (
        outsider_answers["fake-list"].status_code,
        outsider_answers["fake-list"].json(),
    )
    assert outsider_answers["real-list"].status_code == 404
