"""The Mailer seam: two messages, and a default that needs no configuration."""

import logging

import pytest
from fastapi.testclient import TestClient
from media_canvas_api.mailer import (
    ConsoleMailer,
    RecordingMailer,
    ResendMailer,
    SmtpMailer,
    build_mailer,
)
from media_canvas_api.main import app
from media_canvas_api.settings import SettingsError, load_settings
from pytest import LogCaptureFixture

REQUIRED = {
    "POSTGRES_PASSWORD": "secret",
    "GARAGE_DEFAULT_ACCESS_KEY": "key",
    "GARAGE_DEFAULT_SECRET_KEY": "another-secret",
    "INTERNAL_API_TOKEN": "shared-with-the-worker",
}

MAILER_VARIABLES = (
    "MAILER",
    "RESEND_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM",
)


def configured(monkeypatch: pytest.MonkeyPatch, **env: str):
    """Settings from the environment, with mail variables isolated."""
    for name, value in REQUIRED.items():
        monkeypatch.setenv(name, value)
    for name in MAILER_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return load_settings(env_file=None)


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


def test_an_unset_mailer_variable_selects_the_console_driver(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mailer = build_mailer(configured(monkeypatch))

    assert isinstance(mailer, ConsoleMailer)


def test_an_unknown_driver_fails_startup_rather_than_falling_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SettingsError) as failure:
        build_mailer(configured(monkeypatch, MAILER="pigeon"))

    assert "MAILER" in str(failure.value)


def test_resend_without_an_api_key_fails_naming_the_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SettingsError) as failure:
        build_mailer(
            configured(monkeypatch, MAILER="resend", EMAIL_FROM="noreply@example.com")
        )

    assert "RESEND_API_KEY" in str(failure.value)


def test_resend_without_a_sender_fails_naming_the_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SettingsError) as failure:
        build_mailer(configured(monkeypatch, MAILER="resend", RESEND_API_KEY="re_test"))

    assert "EMAIL_FROM" in str(failure.value)


def test_the_resend_driver_constructs_from_its_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mailer = build_mailer(
        configured(
            monkeypatch,
            MAILER="resend",
            RESEND_API_KEY="re_test",
            EMAIL_FROM="noreply@example.com",
        )
    )

    assert mailer == ResendMailer(api_key="re_test", sender="noreply@example.com")


def test_smtp_without_a_host_fails_naming_the_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SettingsError) as failure:
        build_mailer(
            configured(
                monkeypatch,
                MAILER="smtp",
                SMTP_PORT="587",
                SMTP_USER="user",
                SMTP_PASSWORD="pass",
                EMAIL_FROM="noreply@example.com",
            )
        )

    assert "SMTP_HOST" in str(failure.value)


def test_smtp_without_a_sender_fails_naming_the_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(SettingsError) as failure:
        build_mailer(
            configured(
                monkeypatch,
                MAILER="smtp",
                SMTP_HOST="smtp.example.com",
                SMTP_PORT="587",
                SMTP_USER="user",
                SMTP_PASSWORD="pass",
            )
        )

    assert "EMAIL_FROM" in str(failure.value)


def test_the_smtp_driver_constructs_from_its_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mailer = build_mailer(
        configured(
            monkeypatch,
            MAILER="smtp",
            SMTP_HOST="smtp.example.com",
            SMTP_USER="user",
            SMTP_PASSWORD="pass",
            EMAIL_FROM="noreply@example.com",
        )
    )

    assert mailer == SmtpMailer(
        host="smtp.example.com",
        port=587,
        user="user",
        password="pass",
        sender="noreply@example.com",
    )
