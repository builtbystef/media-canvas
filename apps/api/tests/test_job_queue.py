"""Enqueue and the internal job contracts.

A submitted batch becomes one BullMQ task per Row, identifiers only.
The worker then fetches the Job, fetches each Row (which starts it),
and reports the outcome. Tests watch the queue through BullMQ's own
keys, and the Job through the polling route — never the tables.
"""

import json
import socket
from typing import Any

from conftest import Account, Accounts
from fastapi.testclient import TestClient
from media_canvas_api.main import app
from media_canvas_api.settings import Settings

# BullMQ's default prefix and the queue this producer writes. The Node
# worker consumes the same name.
QUEUE = "rows"
PREFIX = f"bull:{QUEUE}"


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
        json={"kind": "design", "name": "Spring sale", "document": a_document()},
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


def as_the_worker(client: TestClient) -> dict[str, str]:
    client.cookies.clear()
    token: str = client.app.state.settings.internal_api_token
    return {"authorization": f"Bearer {token}"}


def waiting_tasks(settings: Settings) -> list[dict[str, Any]]:
    """The payloads sitting in BullMQ's wait list — the queue's contract."""
    redis = SyncRedis(settings)
    try:
        ids = redis.lrange(f"{PREFIX}:wait", 0, -1)
        tasks = []
        for job_id in ids:
            raw = redis.hget(f"{PREFIX}:{job_id}", "data")
            assert raw is not None, f"BullMQ job {job_id} has no data"
            tasks.append(json.loads(raw))
        return tasks
    finally:
        redis.close()


class SyncRedis:
    """A handful of Redis commands over RESP, for observing the queue."""

    def __init__(self, settings: Settings) -> None:
        if settings.redis_host.startswith("/"):
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.connect(settings.redis_host)
        else:
            self.sock = socket.create_connection(
                (settings.redis_host, settings.redis_port)
            )
        if settings.redis_db:
            self.execute("SELECT", str(settings.redis_db))

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        found = self.execute("LRANGE", key, str(start), str(end))
        assert isinstance(found, list)
        return [item.decode() if isinstance(item, bytes) else item for item in found]

    def hget(self, key: str, field: str) -> str | None:
        found = self.execute("HGET", key, field)
        if found is None:
            return None
        if isinstance(found, bytes):
            return found.decode()
        if isinstance(found, str):
            return found
        raise TypeError(f"HGET returned {type(found)}")

    def flushdb(self) -> None:
        self.execute("FLUSHDB")

    def execute(self, *parts: str) -> object:
        payload = f"*{len(parts)}\r\n".encode()
        for part in parts:
            encoded = part.encode()
            payload += f"${len(encoded)}\r\n".encode() + encoded + b"\r\n"
        self.sock.sendall(payload)
        return self._read()

    def _read(self) -> object:
        prefix = self._recv(1)
        if prefix == b"+":
            return self._line()
        if prefix == b"-":
            raise RuntimeError(self._line().decode())
        if prefix == b":":
            return int(self._line())
        if prefix == b"$":
            length = int(self._line())
            if length == -1:
                return None
            data = self._recv(length)
            self._recv(2)  # CRLF
            return data
        if prefix == b"*":
            count = int(self._line())
            if count == -1:
                return None
            return [self._read() for _ in range(count)]
        raise RuntimeError(f"unexpected RESP type {prefix!r}")

    def _line(self) -> bytes:
        buf = b""
        while not buf.endswith(b"\r\n"):
            buf += self._recv(1)
        return buf[:-2]

    def _recv(self, size: int) -> bytes:
        buf = b""
        while len(buf) < size:
            chunk = self.sock.recv(size - len(buf))
            if not chunk:
                raise RuntimeError("Redis closed the connection")
            buf += chunk
        return buf

    def close(self) -> None:
        self.sock.close()


def test_submitting_a_batch_enqueues_one_id_only_task_per_row(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    accounts.sign_in("alice@example.com")
    template = a_template(client, a_workspace(client))
    rows = [
        {"headline": "One"},
        {"_name": "hero", "headline": "Two"},
        {"headline": "Three"},
    ]

    submitted = submit(client, template, rows)
    job = submitted.json()
    tasks = waiting_tasks(settings)

    assert submitted.status_code == 201, submitted.text
    assert len(tasks) == 3
    assert {task["jobId"] for task in tasks} == {job["id"]}
    assert len({task["rowId"] for task in tasks}) == 3
    for task in tasks:
        assert set(task) == {"jobId", "rowId"}


def a_submitted_job(
    client: TestClient, accounts: Accounts, settings: Settings, n: int = 2
) -> tuple[Account, str, str, list[dict[str, Any]]]:
    """Sign in, submit n Rows, return (account, workspace, job id, tasks)."""
    alice = accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    template = a_template(client, workspace)
    submitted = submit(client, template, [{"headline": f"Row {i}"} for i in range(n)])
    assert submitted.status_code == 201, submitted.text
    return alice, workspace, submitted.json()["id"], waiting_tasks(settings)


def internal_job(job_id: str) -> str:
    return f"/internal/jobs/{job_id}"


def internal_row(job_id: str, row_id: str) -> str:
    return f"/internal/jobs/{job_id}/rows/{row_id}"


def internal_result(job_id: str, row_id: str) -> str:
    return f"/internal/jobs/{job_id}/rows/{row_id}/result"


def test_internal_calls_require_the_shared_credential_and_are_not_public(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    alice, _, job_id, tasks = a_submitted_job(client, accounts, settings, n=1)
    row_id = tasks[0]["rowId"]
    address = internal_job(job_id)
    row_address = internal_row(job_id, row_id)
    result_address = internal_result(job_id, row_id)

    accounts.acting_as(alice)
    as_owner = client.get(address)
    client.cookies.clear()
    anonymous = client.get(address)
    wrong = client.get(address, headers={"authorization": "Bearer not-the-token"})
    worker = as_the_worker(client)
    accepted = client.get(address, headers=worker)
    row_refused = client.get(row_address)
    result_refused = client.post(result_address, json={"status": "succeeded"})

    assert (anonymous.status_code, as_owner.status_code, wrong.status_code) == (
        401,
        401,
        401,
    )
    assert accepted.status_code == 200, accepted.text
    assert row_refused.status_code == 401
    assert result_refused.status_code == 401
    paths = app.openapi()["paths"]
    assert not any(path.startswith("/internal") for path in paths)


def test_the_job_call_returns_the_snapshot_output_and_workspace(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    _, workspace, job_id, _ = a_submitted_job(client, accounts, settings, n=1)

    fetched = client.get(internal_job(job_id), headers=as_the_worker(client))

    assert fetched.status_code == 200, fetched.text
    body = fetched.json()
    assert body["workspaceId"] == workspace
    assert body["output"] == {"format": "png", "scale": 1}
    assert body["templateSnapshot"] == a_document()
    assert set(body) == {"workspaceId", "output", "templateSnapshot"}


def test_the_row_call_returns_values_name_and_index_and_starts_the_job(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    alice, _, job_id, tasks = a_submitted_job(client, accounts, settings, n=2)
    first, second = tasks[0], tasks[1]
    worker = as_the_worker(client)

    fetched = client.get(internal_row(job_id, first["rowId"]), headers=worker)
    accounts.acting_as(alice)
    after_first = client.get(f"/api/v1/jobs/{job_id}")
    worker = as_the_worker(client)
    client.get(internal_row(job_id, second["rowId"]), headers=worker)
    accounts.acting_as(alice)
    after_second = client.get(f"/api/v1/jobs/{job_id}")

    assert fetched.status_code == 200, fetched.text
    body = fetched.json()
    assert set(body) == {"values", "name", "rowIndex"}
    assert body["values"] == {"headline": f"Row {body['rowIndex']}"}
    assert body["name"] == str(body["rowIndex"])
    first_job = after_first.json()
    assert first_job["state"] == "rendering"
    assert first_job["progress"]["rendering"] == 1
    assert first_job["progress"]["queued"] == 1
    assert after_second.json()["state"] == "rendering"
    assert after_second.json()["progress"]["rendering"] == 2
    assert after_second.json()["progress"]["queued"] == 0


def test_the_last_result_completes_the_job_even_when_a_row_failed(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    alice, _, job_id, tasks = a_submitted_job(client, accounts, settings, n=5)
    worker = as_the_worker(client)
    for task in tasks:
        fetched = client.get(internal_row(job_id, task["rowId"]), headers=worker)
        assert fetched.status_code == 200, fetched.text

    for task in tasks[:-1]:
        reported = client.post(
            internal_result(job_id, task["rowId"]),
            headers=worker,
            json={"status": "succeeded", "outputKey": f"out/{task['rowId']}.png"},
        )
        assert reported.status_code == 204, reported.text
    accounts.acting_as(alice)
    mid = client.get(f"/api/v1/jobs/{job_id}")
    worker = as_the_worker(client)
    last = client.post(
        internal_result(job_id, tasks[-1]["rowId"]),
        headers=worker,
        json={
            "status": "failed",
            "error": {"variable": "photo", "message": "could not fetch"},
        },
    )
    accounts.acting_as(alice)
    done = client.get(f"/api/v1/jobs/{job_id}")

    assert mid.status_code == 200
    assert mid.json()["state"] == "rendering"
    assert mid.json()["progress"] == {
        "queued": 0,
        "rendering": 1,
        "succeeded": 4,
        "failed": 0,
        "skipped": 0,
    }
    assert last.status_code == 204, last.text
    body = done.json()
    assert body["state"] == "completed"
    assert body["progress"] == {
        "queued": 0,
        "rendering": 0,
        "succeeded": 4,
        "failed": 1,
        "skipped": 0,
    }
    statuses = [row["status"] for row in body["rows"]]
    assert statuses.count("succeeded") == 4
    assert statuses.count("failed") == 1
    failed = next(row for row in body["rows"] if row["status"] == "failed")
    assert failed["error"] == {"variable": "photo", "message": "could not fetch"}


def test_reporting_the_same_row_twice_does_not_move_a_completed_job_backwards(
    client: TestClient, accounts: Accounts, settings: Settings
) -> None:
    alice, _, job_id, tasks = a_submitted_job(client, accounts, settings, n=1)
    row_id = tasks[0]["rowId"]
    worker = as_the_worker(client)
    client.get(internal_row(job_id, row_id), headers=worker)
    first = client.post(
        internal_result(job_id, row_id),
        headers=worker,
        json={"status": "succeeded", "outputKey": "out/hero.png"},
    )
    second = client.post(
        internal_result(job_id, row_id),
        headers=worker,
        json={
            "status": "failed",
            "error": {"message": "late failure"},
        },
    )
    accounts.acting_as(alice)
    polled = client.get(f"/api/v1/jobs/{job_id}")

    assert first.status_code == 204, first.text
    assert second.status_code == 204, second.text
    body = polled.json()
    assert body["state"] == "completed"
    assert body["progress"]["succeeded"] == 1
    assert body["progress"]["failed"] == 0
    assert body["rows"][0]["status"] == "succeeded"
    assert "error" not in body["rows"][0]
