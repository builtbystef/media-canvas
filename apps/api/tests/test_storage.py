"""What the tables hold, and stop holding.

These claims are about storage, so storage is where they are read. The
behaviour is still driven through the public api: only the observation is a
query, because there is no response that could carry it.
"""

from datetime import timedelta

from conftest import FakeClock
from fastapi.testclient import TestClient
from media_canvas_api.mailer import RecordingMailer
from sqlalchemy import Engine, text
from test_auth import sign_in


def test_neither_a_code_nor_a_session_token_is_stored_in_the_clear(
    client: TestClient, mailer: RecordingMailer, stored: Engine
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    code = mailer.otps[-1].code
    client.post(
        "/api/v1/auth/otp/verify", json={"email": "alice@example.com", "code": code}
    )
    token = client.cookies["media_canvas_session"]

    assert code not in column(stored, "otp_codes", "code_hash")
    assert token not in column(stored, "sessions", "token_hash")


def test_a_codes_row_goes_once_it_can_no_longer_count_for_anything(
    client: TestClient, clock: FakeClock, stored: Engine
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    clock.advance(timedelta(hours=1, seconds=1))

    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})

    assert len(column(stored, "otp_codes", "id")) == 1


def test_an_expired_session_row_goes_when_its_cookie_is_next_presented(
    client: TestClient, mailer: RecordingMailer, clock: FakeClock, stored: Engine
) -> None:
    sign_in(client, mailer, "alice@example.com")
    clock.advance(timedelta(days=30, seconds=1))

    client.get("/api/v1/me")

    assert column(stored, "sessions", "id") == []


def column(engine: Engine, table: str, name: str) -> list[str]:
    with engine.connect() as reading:
        return [
            str(value)
            for value in reading.execute(text(f"SELECT {name} FROM {table}")).scalars()
        ]
