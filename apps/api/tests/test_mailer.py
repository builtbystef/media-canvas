"""The Mailer seam: two messages, and a default that needs no configuration."""

import logging

from fastapi.testclient import TestClient
from media_canvas_api.mailer import ConsoleMailer, RecordingMailer
from media_canvas_api.main import app
from pytest import LogCaptureFixture


def test_the_console_driver_puts_both_messages_in_the_api_log(
    caplog: LogCaptureFixture,
) -> None:
    mailer = ConsoleMailer()

    with caplog.at_level(logging.INFO):
        mailer.send_otp("alice@example.com", "123456")
        mailer.send_invite(
            "bob@example.com", "Studio", "editor", "http://localhost:3000/invites/tok"
        )

    assert "alice@example.com" in caplog.text
    assert "123456" in caplog.text
    assert "bob@example.com" in caplog.text
    assert "http://localhost:3000/invites/tok" in caplog.text


def test_an_instance_that_configures_nothing_signs_people_in_from_its_log(
    caplog: LogCaptureFixture,
) -> None:
    with TestClient(app) as started, caplog.at_level(logging.INFO):
        started.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})

    assert "sign-in code for alice@example.com" in caplog.text


def test_the_recording_fake_keeps_the_two_messages_apart() -> None:
    mailer = RecordingMailer()

    mailer.send_otp("alice@example.com", "123456")
    mailer.send_invite("bob@example.com", "Studio", "editor", "http://elsewhere/t")

    assert [message.code for message in mailer.otps] == ["123456"]
    assert [message.workspace_name for message in mailer.invites] == ["Studio"]
