"""The one seam between the api and email (ADR-0009).

The product sends exactly two messages, and that is what keeps a mail seam
worth having: the interface below is the whole of it. The driver is selected
by `MAILER` at startup: `console` (the default) prints both to the api log,
`resend` uses the official Resend Python SDK, and `smtp` uses stdlib
`smtplib`. A missing setting or an unknown name fails startup naming the
variable, so a misconfiguration is caught before anyone tries to sign in.
`RecordingMailer` is the fake the tests assert against; it lives here, beside
the interface it implements, so that every driver of this seam is in one file.
"""

import logging
import os
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Protocol

import resend

from media_canvas_api.settings import Settings, SettingsError, find_env_file

logger = logging.getLogger(__name__)


class Mailer(Protocol):
    """What the api can send. Two messages, and never a third without a spec."""

    def send_otp(self, to: str, code: str) -> None:
        """The sign-in code someone just asked for."""
        ...

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        """An Owner's offer of Membership in one Workspace."""
        ...


def _echo_to_dev_log(line: str) -> None:
    """Mirror a console Mailer line into `.dev/mailer.log`."""

    # Pytest drives ConsoleMailer in-process; the running api never has this
    # set. Skip so unit tests do not append to the developer's log.
    if "PYTEST_CURRENT_TEST" in os.environ:
        return
    env = find_env_file()
    if env is None:
        return
    path = env.parent / ".dev" / "mailer.log"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf8") as handle:
            handle.write(line + "\n")
    except OSError:
        return


class ConsoleMailer:
    """Prints both messages to the api log.

    The default driver: development and an offline self-hosted instance both
    sign in by reading the code out of the log. The same lines are appended
    to `.dev/mailer.log` so another process (the generation smoke) can read
    them without sharing the api's stdout.
    """

    def send_otp(self, to: str, code: str) -> None:
        logger.info("sign-in code for %s: %s", to, code)
        _echo_to_dev_log(f"sign-in code for {to}: {code}")

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        logger.info(
            "invite for %s to %s as %s: %s", to, workspace_name, role, accept_url
        )
        _echo_to_dev_log(f"invite for {to} to {workspace_name} as {role}: {accept_url}")


@dataclass(frozen=True)
class ResendMailer:
    """Sends both messages through Resend's official client."""

    api_key: str
    sender: str

    def send_otp(self, to: str, code: str) -> None:
        self._send(to, "Your sign-in code", f"<p>Your sign-in code is {code}.</p>")

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        self._send(
            to,
            f"Invitation to {workspace_name}",
            (
                f"<p>You've been invited to {workspace_name} as {role}.</p>"
                f'<p><a href="{accept_url}">{accept_url}</a></p>'
            ),
        )

    def _send(self, to: str, subject: str, html: str) -> None:
        resend.api_key = self.api_key
        resend.Emails.send(
            {
                "from": self.sender,
                "to": [to],
                "subject": subject,
                "html": html,
            }
        )


@dataclass(frozen=True)
class SmtpMailer:
    """Sends both messages over SMTP with the configured host and credentials."""

    host: str
    port: int
    user: str
    password: str
    sender: str

    def send_otp(self, to: str, code: str) -> None:
        self._send(to, "Your sign-in code", f"Your sign-in code is {code}.")

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        self._send(
            to,
            f"Invitation to {workspace_name}",
            (
                f"You've been invited to {workspace_name} as {role}.\n"
                f"Accept: {accept_url}"
            ),
        )

    def _send(self, to: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        with smtplib.SMTP(self.host, self.port) as smtp:
            smtp.starttls()
            smtp.login(self.user, self.password)
            smtp.send_message(message)


@dataclass(frozen=True)
class OtpMessage:
    to: str
    code: str


@dataclass(frozen=True)
class InviteMessage:
    to: str
    workspace_name: str
    role: str
    accept_url: str


@dataclass
class RecordingMailer:
    """Keeps every message instead of sending it, for the tests to read."""

    otps: list[OtpMessage] = field(default_factory=list)
    invites: list[InviteMessage] = field(default_factory=list)

    def send_otp(self, to: str, code: str) -> None:
        self.otps.append(OtpMessage(to=to, code=code))

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        self.invites.append(
            InviteMessage(
                to=to, workspace_name=workspace_name, role=role, accept_url=accept_url
            )
        )


def build_mailer(settings: Settings) -> Mailer:
    """The driver the environment asked for, or a reason the process cannot start."""
    driver = settings.mailer.strip().lower() or "console"
    if driver == "console":
        return ConsoleMailer()
    if driver == "resend":
        if not settings.resend_api_key:
            raise _missing("RESEND_API_KEY", driver)
        if not settings.email_from:
            raise _missing("EMAIL_FROM", driver)
        return ResendMailer(api_key=settings.resend_api_key, sender=settings.email_from)
    if driver == "smtp":
        if not settings.smtp_host:
            raise _missing("SMTP_HOST", driver)
        if not settings.smtp_user:
            raise _missing("SMTP_USER", driver)
        if not settings.smtp_password:
            raise _missing("SMTP_PASSWORD", driver)
        if not settings.email_from:
            raise _missing("EMAIL_FROM", driver)
        return SmtpMailer(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password,
            sender=settings.email_from,
        )
    raise SettingsError(
        "The environment does not describe a runnable api — "
        f"MAILER={settings.mailer!r} is not one of console, resend, smtp. "
        "Copy .env.example to .env and fill in the values it marks required."
    )


def _missing(name: str, driver: str) -> SettingsError:
    return SettingsError(
        "The environment does not describe a runnable api — "
        f"{name} is required when MAILER={driver}. "
        "Copy .env.example to .env and fill in the values it marks required."
    )
