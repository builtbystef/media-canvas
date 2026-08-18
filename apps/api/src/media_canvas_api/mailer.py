"""The one seam between the api and email (ADR-0009).

The product sends exactly two messages, and that is what keeps a mail seam
worth having: the interface below is the whole of it. `ConsoleMailer` is the
default, so a self-hosted stack signs people in with no external service and
no configuration at all — the code is in the api log. `RecordingMailer` is the
fake the tests assert against; it lives here, beside the interface it
implements, so that every driver of this seam is in one file.
"""

import logging
from dataclasses import dataclass, field
from typing import Protocol

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


class ConsoleMailer:
    """Prints both messages to the api log.

    The default driver: development and an offline self-hosted instance both
    sign in by reading the code out of the log.
    """

    def send_otp(self, to: str, code: str) -> None:
        logger.info("sign-in code for %s: %s", to, code)

    def send_invite(
        self, to: str, workspace_name: str, role: str, accept_url: str
    ) -> None:
        logger.info(
            "invite for %s to %s as %s: %s", to, workspace_name, role, accept_url
        )


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
