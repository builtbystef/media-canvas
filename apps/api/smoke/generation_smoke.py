"""Compose-level generation smoke: one batch through the real stack.

Not part of `pnpm test`. The FastAPI test client and the worker stand-in never
load here — this file talks to a running api, which talks to a running worker,
queue, database, and object store. The README says how to start those and how
to run this file.
"""

from __future__ import annotations

import os
import re
import subprocess
import time
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from io import BytesIO
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import httpx
from PIL import Image

OTP_LINE = re.compile(r"sign-in code for ([^:]+): (\d{6})")
POLL_SECONDS = 60
POLL_EVERY = 0.25


def api_url() -> str:
    return os.environ.get("SMOKE_API_URL", "http://localhost:8000").rstrip("/")


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for directory in (here, *here.parents):
        if (directory / "docker-compose.yml").is_file():
            return directory
    raise AssertionError("could not find the repository root")


def a_picture() -> bytes:
    drawn = Image.new("RGB", (40, 30), (200, 30, 30))
    written = BytesIO()
    drawn.save(written, format="PNG")
    return written.getvalue()


def smoke_template(font_id: str, image: dict[str, Any]) -> dict[str, Any]:
    """A Template that names a bundled font and a held image.

    Both references travel through the worker's internal asset route; an empty
    document would skip that path and still produce a zip.
    """
    return {
        "schemaVersion": 1,
        "canvas": {"width": 128, "height": 128, "background": "#ffffff"},
        "variables": [{"name": "headline", "type": "text"}],
        "elements": [
            {
                "id": "photo",
                "type": "image",
                "x": 0,
                "y": 0,
                "width": 128,
                "height": 80,
                "rotation": 0,
                "opacity": 1,
                "visible": True,
                "src": image["id"],
                "naturalWidth": image["width"],
                "naturalHeight": image["height"],
                "fitMode": "cover",
                "clip": "none",
            },
            {
                "id": "headline",
                "type": "text",
                "x": 8,
                "y": 88,
                "width": 112,
                "rotation": 0,
                "opacity": 1,
                "visible": True,
                "content": "{{headline}}",
                "fontAssetId": font_id,
                "fontSize": 16,
                "lineHeight": 1.2,
                "letterSpacing": 0,
                "align": "left",
                "anchor": "top",
                "color": "#000000",
            },
        ],
    }


@contextmanager
def connect() -> Iterator[httpx.Client]:
    url = api_url()
    with httpx.Client(base_url=url, timeout=30.0) as client:
        try:
            health = client.get("/api/health")
        except httpx.ConnectError as refused:
            raise AssertionError(
                f"the api is not running at {url}. Start the development stack "
                "first; see the README."
            ) from refused
        assert health.status_code == 200, health.text
        assert health.json()["status"] == "ok", health.text
        yield client


def log_sources() -> list[str]:
    texts: list[str] = []
    named = os.environ.get("SMOKE_API_LOG")
    if named:
        texts.append(Path(named).read_text(encoding="utf8"))
    mailer_log = repo_root() / ".dev" / "mailer.log"
    if mailer_log.is_file():
        texts.append(mailer_log.read_text(encoding="utf8"))
    with suppress(OSError, subprocess.CalledProcessError):
        texts.append(
            subprocess.check_output(
                ["docker", "compose", "logs", "--no-color", "api"],
                cwd=repo_root(),
                text=True,
                stderr=subprocess.DEVNULL,
            )
        )
    return texts


def read_code(email: str) -> str:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        for text in log_sources():
            for line in reversed(text.splitlines()):
                matched = OTP_LINE.search(line)
                if matched and matched.group(1) == email:
                    return matched.group(2)
        time.sleep(0.1)
    raise AssertionError(
        f"the console Mailer did not log a sign-in code for {email}. "
        "The smoke reads .dev/mailer.log and `docker compose logs api`; "
        "set SMOKE_API_LOG to the api process log if neither holds it."
    )


def sign_in(client: httpx.Client) -> None:
    email = f"generation-smoke-{time.time_ns()}@example.com"
    requested = client.post("/api/v1/auth/otp/request", json={"email": email})
    assert requested.status_code == 204, requested.text
    code = read_code(email)
    verified = client.post(
        "/api/v1/auth/otp/verify", json={"email": email, "code": code}
    )
    assert verified.status_code == 204, verified.text


def test_a_two_row_batch_completes_and_downloads_an_archive_of_two() -> None:
    with connect() as client:
        sign_in(client)

        workspace = client.post("/api/v1/workspaces", json={"name": "Smoke"})
        assert workspace.status_code == 201, workspace.text
        workspace_id = workspace.json()["id"]

        fonts = client.get(f"/api/v1/workspaces/{workspace_id}/fonts")
        assert fonts.status_code == 200, fonts.text
        inter = next(
            font
            for font in fonts.json()
            if font["family"] == "Inter"
            and font["weight"] == 400
            and not font["italic"]
            and font["bundled"]
        )

        uploaded = client.post(
            f"/api/v1/workspaces/{workspace_id}/images",
            files={"file": ("photo.png", a_picture(), "image/png")},
        )
        assert uploaded.status_code == 201, uploaded.text
        image = uploaded.json()

        design = client.post(
            f"/api/v1/workspaces/{workspace_id}/documents",
            json={
                "kind": "design",
                "name": "Smoke poster",
                "document": smoke_template(inter["id"], image),
            },
        )
        assert design.status_code == 201, design.text
        promoted = client.post(f"/api/v1/documents/{design.json()['id']}/promote")
        assert promoted.status_code == 201, promoted.text
        template_id = promoted.json()["id"]

        submitted = client.post(
            f"/api/v1/templates/{template_id}/jobs",
            json={
                "rows": [
                    {"headline": "One", "_name": "one"},
                    {"headline": "Two", "_name": "two"},
                ],
                "output": {"format": "png", "scale": 1},
            },
        )
        assert submitted.status_code == 201, submitted.text
        job_id = submitted.json()["id"]

        deadline = time.monotonic() + POLL_SECONDS
        job = submitted.json()
        while time.monotonic() < deadline:
            polled = client.get(f"/api/v1/jobs/{job_id}")
            assert polled.status_code == 200, polled.text
            job = polled.json()
            if job["state"] in {"completed", "failed", "canceled"}:
                break
            time.sleep(POLL_EVERY)

        assert job["state"] == "completed", job
        assert job["progress"]["succeeded"] == 2, job
        assert job["progress"]["failed"] == 0, job

        archive = client.get(f"/api/v1/jobs/{job_id}/outputs.zip")
        assert archive.status_code == 200, archive.text
        with ZipFile(BytesIO(archive.content)) as zipped:
            names = sorted(zipped.namelist())
        assert names == ["one.png", "two.png"]
