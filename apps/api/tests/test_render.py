"""The synchronous render endpoint.

Every claim is made at the public HTTP seam. The worker's render contract
is stood in: the api passes values through and hands back the bytes — or
the named-Variable errors — it receives.
"""

from typing import Any
from uuid import uuid4

from botocore.client import BaseClient
from conftest import Accounts, Join
from fastapi.testclient import TestClient
from media_canvas_api.settings import Settings
from media_canvas_api.worker import NamedProblem, RecordingWorker
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


def a_design(client: TestClient, workspace: str) -> str:
    created = client.post(
        f"/api/v1/workspaces/{workspace}/documents",
        json={"kind": "design", "name": "Poster", "document": a_document()},
    )
    assert created.status_code == 201, created.text
    design: str = created.json()["id"]
    return design


def a_template(client: TestClient, workspace: str) -> str:
    design = a_design(client, workspace)
    promoted = client.post(f"/api/v1/documents/{design}/promote")
    assert promoted.status_code == 201, promoted.text
    template: str = promoted.json()["id"]
    return template


def render(
    client: TestClient,
    document: str,
    values: dict[str, Any] | None = None,
    output: dict[str, Any] | None = None,
) -> Any:
    body: dict[str, Any] = {"output": output or {"format": "png", "scale": 1}}
    if values is not None:
        body["values"] = values
    return client.post(f"/api/v1/documents/{document}/render", json=body)


def test_rendering_a_template_returns_the_file_bytes(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)

    answered = render(client, template, {"headline": "Sale"})

    assert answered.status_code == 200, answered.text
    assert answered.headers["content-type"] == "image/png"
    assert answered.content == worker.file
    assert len(worker.renders) == 1
    assert worker.renders[0].workspace_id == workspace
    assert worker.renders[0].template == a_document()
    assert worker.renders[0].values == {"headline": "Sale"}
    assert worker.renders[0].output == {"format": "png", "scale": 1}


def test_each_output_format_answers_with_its_content_type(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))

    png1 = render(client, template, output={"format": "png", "scale": 1})
    png2 = render(client, template, output={"format": "png", "scale": 2})
    png3 = render(client, template, output={"format": "png", "scale": 3})
    jpeg = render(client, template, output={"format": "jpeg"})
    jpeg_q = render(client, template, output={"format": "jpeg", "quality": 75})
    pdf = render(client, template, output={"format": "pdf"})
    unknown = render(client, template, output={"format": "gif"})
    bad_scale = render(client, template, output={"format": "png", "scale": 4})

    assert {png1.status_code, png2.status_code, png3.status_code} == {200}
    assert png2.headers["content-type"] == "image/png"
    assert jpeg.status_code == 200
    assert jpeg.headers["content-type"] == "image/jpeg"
    assert jpeg_q.status_code == 200
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert unknown.status_code == 422
    assert bad_scale.status_code == 422
    assert [call.output for call in worker.renders] == [
        {"format": "png", "scale": 1},
        {"format": "png", "scale": 2},
        {"format": "png", "scale": 3},
        {"format": "jpeg", "quality": 90},
        {"format": "jpeg", "quality": 75},
        {"format": "pdf"},
    ]


def test_a_template_called_with_no_values_is_refused_naming_the_variable(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))
    worker.refuses_values(
        NamedProblem(variable="headline", message="headline is required")
    )

    refused = render(client, template)

    assert refused.status_code == 422, refused.text
    assert refused.json() == {
        "errors": [{"variable": "headline", "message": "headline is required"}]
    }
    assert refused.content != worker.file
    assert worker.renders[0].values == {}


def test_a_design_renders_with_no_values(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    design = a_design(client, workspace)

    answered = render(client, design)

    assert answered.status_code == 200, answered.text
    assert answered.content == worker.file
    assert worker.renders[0].workspace_id == workspace
    assert worker.renders[0].template == a_document()
    assert worker.renders[0].values == {}


def test_a_design_given_values_is_refused_without_calling_the_worker(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    design = a_design(client, a_workspace(client))

    refused = render(client, design, {"headline": "Sale"})

    assert refused.status_code == 422, refused.text
    assert refused.json()["errors"]
    assert worker.renders == []


def test_the_same_call_twice_leaves_no_record_and_stores_no_object(
    client: TestClient,
    accounts: Accounts,
    worker: RecordingWorker,
    stored: Engine,
    s3: BaseClient,
    settings: Settings,
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))

    first = render(client, template, {"headline": "Sale"})
    second = render(client, template, {"headline": "Sale"})

    assert first.status_code == second.status_code == 200
    assert first.content == second.content == worker.file
    assert len(worker.renders) == 2
    with stored.connect() as connection:
        jobs = connection.execute(
            text("SELECT count(*) FROM generation_jobs")
        ).scalar_one()
        rows = connection.execute(
            text("SELECT count(*) FROM generation_rows")
        ).scalar_one()
    assert (jobs, rows) == (0, 0)
    outputs = s3.list_objects_v2(Bucket=settings.outputs_bucket).get("Contents", [])
    assert outputs == []


def test_rendering_is_an_editor_action_and_an_outsider_learns_nothing(
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
    as_editor = render(client, template)
    accounts.acting_as(viewer)
    as_viewer = render(client, template)
    accounts.acting_as(outsider)
    missing = str(uuid4())
    real = render(client, template)
    fake = render(client, missing)

    assert as_editor.status_code == 200, as_editor.text
    assert as_viewer.status_code == 403
    assert (real.status_code, real.json()) == (fake.status_code, fake.json())
    assert real.status_code == 404
