"""The api's reading of the current time, behind one replaceable function.

Sign-in is full of deadlines — code expiry, verification windows, rate-limit
windows, rolling session expiry — and none of them can be tested by waiting.
Everything that needs the time takes a `Clock`, so a test can hand it one it
controls.
"""

from collections.abc import Callable
from datetime import UTC, datetime

type Clock = Callable[[], datetime]


def utc_now() -> datetime:
    """The real clock: the current time, always timezone-aware and in UTC."""
    return datetime.now(UTC)
