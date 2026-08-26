"""CSV batch submission.

Every claim is made at the public HTTP seam. The worker's validation
contract is stood in; cells:true and the string cells are observed on
that call. Stored values and leftover rows after a refusal are read
from the tables because neither is on the public JobView.
"""

from typing import Any

from conftest import Accounts
from fastapi.testclient import TestClient
from media_canvas_api.worker import BatchValidation, RecordingWorker, RowError
from sqlalchemy import Engine, text
from test_jobs import a_document, a_template, a_workspace, submit


def a_template_declaring(
    client: TestClient, workspace: str, *variables: dict[str, Any]
) -> str:
    document = a_document()
    document["variables"] = list(variables)
    return a_template(client, workspace, document)


def submit_csv(
    client: TestClient,
    template: str,
    body: str,
    query: str,
) -> Any:
    return client.post(
        f"/api/v1/templates/{template}/jobs?{query}",
        content=body,
        headers={"content-type": "text/csv"},
    )


def stored_values(engine: Engine, job_id: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT values FROM generation_rows"
                " WHERE job_id = CAST(:id AS uuid) ORDER BY row_index"
            ),
            {"id": job_id},
        ).scalars()
        return list(rows)


def test_posting_csv_creates_the_same_job_the_equivalent_json_would(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template_declaring(
        client, workspace, {"name": "headline", "type": "text"}
    )
    worker.batch = BatchValidation(
        errors=[],
        template_errors=[],
        rows=[{"headline": "One"}, {"headline": "Two"}],
    )

    json_job = submit(client, template, [{"headline": "One"}, {"headline": "Two"}])
    csv_job = submit_csv(client, template, "headline\nOne\nTwo\n", "format=png&scale=1")

    assert json_job.status_code == 201, json_job.text
    assert csv_job.status_code == 201, csv_job.text
    json_body = json_job.json()
    csv_body = csv_job.json()
    assert csv_body["state"] == json_body["state"] == "queued"
    assert csv_body["templateId"] == json_body["templateId"] == template
    assert csv_body["output"] == json_body["output"] == {"format": "png", "scale": 1}
    assert csv_body["progress"] == json_body["progress"]
    assert (
        csv_body["rows"]
        == json_body["rows"]
        == [
            {"index": 0, "name": "0", "status": "queued"},
            {"index": 1, "name": "1", "status": "queued"},
        ]
    )
    assert stored_values(stored, csv_body["id"]) == stored_values(
        stored, json_body["id"]
    )
    assert worker.validations[-1].cells is True
    assert worker.validations[-1].rows == [{"headline": "One"}, {"headline": "Two"}]


def test_the_name_column_follows_the_json_channel_and_unknown_headers_are_named(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "headline", "type": "text"}
    )

    named = submit_csv(
        client,
        template,
        "_name,headline\nhero,One\nside,Two\n",
        "format=png&scale=1",
    )
    unknown = submit_csv(
        client,
        template,
        "headline,notes\nOne,keep\n",
        "format=png&scale=1",
    )
    collision = submit_csv(
        client,
        template,
        "_name,headline\nhero,One\nhero,Two\n",
        "format=png&scale=1",
    )
    charset = submit_csv(
        client,
        template,
        "_name,headline\nhero shot,One\n",
        "format=png&scale=1",
    )

    assert named.status_code == 201, named.text
    assert [row["name"] for row in named.json()["rows"]] == ["hero", "side"]
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["variable"] == "notes"
    assert collision.status_code == 422
    assert collision.json()["errors"][0]["variable"] == "_name"
    assert charset.status_code == 422
    assert len(worker.validations) == 1
    with stored.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_jobs")
            ).scalar_one()
            == 1
        )


def test_format_and_idempotency_come_from_query_parameters(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "headline", "type": "text"}
    )
    body = "headline\nOne\n"

    png = submit_csv(client, template, body, "format=png&scale=2")
    jpeg = submit_csv(client, template, body, "format=jpeg")
    jpeg_q = submit_csv(client, template, body, "format=jpeg&quality=75")
    pdf = submit_csv(client, template, body, "format=pdf")
    first = submit_csv(
        client, template, body, "format=png&scale=1&idempotencyKey=batch-1"
    )
    again = submit_csv(
        client, template, body, "format=png&scale=1&idempotencyKey=batch-1"
    )

    assert png.json()["output"] == {"format": "png", "scale": 2}
    assert jpeg.json()["output"] == {"format": "jpeg", "quality": 90}
    assert jpeg_q.json()["output"] == {"format": "jpeg", "quality": 75}
    assert pdf.json()["output"] == {"format": "pdf"}
    assert first.status_code == 201, first.text
    assert again.status_code == 200, again.text
    assert again.json() == first.json()


def test_a_missing_or_contradictory_format_is_refused_before_any_cell_is_read(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "headline", "type": "text"}
    )
    # A file that would also fail the header check, so a cell-level 422
    # would name `notes` — format refusal must not.
    body = "notes\nsecret\n"

    missing = client.post(
        f"/api/v1/templates/{template}/jobs",
        content=body,
        headers={"content-type": "text/csv"},
    )
    png_quality = submit_csv(client, template, body, "format=png&scale=1&quality=90")
    jpeg_scale = submit_csv(client, template, body, "format=jpeg&scale=2")
    pdf_scale = submit_csv(client, template, body, "format=pdf&scale=1")
    gif = submit_csv(client, template, body, "format=gif")
    png_no_scale = submit_csv(client, template, body, "format=png")

    for refused in (missing, png_quality, jpeg_scale, pdf_scale, gif, png_no_scale):
        assert refused.status_code == 422, refused.text
        assert "errors" not in refused.json()
    assert worker.validations == []
    with stored.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_jobs")
            ).scalar_one()
            == 0
        )


def test_a_price_cell_reaches_validation_as_the_string_and_is_stored_typed(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "price", "type": "number"}
    )
    worker.batch = BatchValidation(
        errors=[], template_errors=[], rows=[{"price": 4.99}]
    )

    submitted = submit_csv(client, template, "price\n4.99\n", "format=png&scale=1")

    assert submitted.status_code == 201, submitted.text
    assert worker.validations[0].cells is True
    assert worker.validations[0].rows == [{"price": "4.99"}]
    assert stored_values(stored, submitted.json()["id"]) == [{"price": 4.99}]


def test_an_invalid_cell_refuses_the_whole_file_naming_the_data_row_index(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "on_sale", "type": "boolean"}
    )
    worker.refuses_rows(
        RowError(
            row_index=0,
            variable="on_sale",
            message='cannot read the cell "True" as a boolean',
        )
    )

    refused = submit_csv(client, template, "on_sale\nTrue\n", "format=png&scale=1")

    assert refused.status_code == 422, refused.text
    assert refused.json()["errors"] == [
        {
            "rowIndex": 0,
            "variable": "on_sale",
            "message": 'cannot read the cell "True" as a boolean',
        }
    ]
    assert worker.validations[0].cells is True
    assert worker.validations[0].rows == [{"on_sale": "True"}]
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


def test_an_empty_cell_means_the_variable_was_omitted(
    client: TestClient, accounts: Accounts, worker: RecordingWorker
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client,
        a_workspace(client),
        {"name": "headline", "type": "text"},
        {"name": "price", "type": "number"},
    )
    worker.refuses_rows(
        RowError(row_index=0, variable="headline", message="headline is required")
    )

    omitted = submit_csv(
        client, template, "headline,price\n,4.99\n", "format=png&scale=1"
    )

    assert omitted.status_code == 422, omitted.text
    assert omitted.json()["errors"][0]["variable"] == "headline"
    assert omitted.json()["errors"][0]["rowIndex"] == 0
    assert worker.validations[0].rows == [{"price": "4.99"}]


def test_a_file_with_a_header_and_no_data_rows_is_refused(
    client: TestClient, accounts: Accounts, worker: RecordingWorker, stored: Engine
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template_declaring(
        client, a_workspace(client), {"name": "headline", "type": "text"}
    )

    refused = submit_csv(client, template, "headline\n", "format=png&scale=1")

    assert refused.status_code == 422, refused.text
    assert worker.validations == []
    with stored.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM generation_jobs")
            ).scalar_one()
            == 0
        )
