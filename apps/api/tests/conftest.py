"""Test fixtures: a real Postgres and a real object store, both empty.

The tests talk to the Postgres and the object storage the compose stack
starts. They never touch what development leaves behind — the database name
and the bucket names are overridden here, before anything reads the settings.
"""

import os
import socket
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timedelta

os.environ["POSTGRES_DB"] = "media_canvas_test"
os.environ["ASSETS_BUCKET"] = "media-canvas-test-assets"
os.environ["OUTPUTS_BUCKET"] = "media-canvas-test-outputs"
os.environ["REDIS_DB"] = "1"
os.environ["MAILER"] = "console"

import boto3
import pytest
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError
from fastapi.testclient import TestClient
from media_canvas_api.clock import utc_now
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.main import app
from media_canvas_api.sessions import COOKIE_NAME
from media_canvas_api.settings import Settings, get_settings
from media_canvas_api.storage import ObjectStore
from media_canvas_api.worker import RecordingWorker
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.exc import OperationalError

UNREACHABLE = (
    "Postgres is not reachable at {host}:{port}. The tests run against the "
    "compose stack's database: `docker compose up -d`."
)

NO_STORE = (
    "Object storage is not reachable at {endpoint}. The tests run against the "
    "compose stack's store: `docker compose up -d`."
)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return get_settings()


@pytest.fixture(scope="session", autouse=True)
def test_database(settings: Settings) -> None:
    """Recreate the test database once, before anything connects to it."""
    recreate_database(settings, settings.postgres_db)


@pytest.fixture(autouse=True)
def clean_database(test_database: None, settings: Settings) -> Iterator[None]:
    """Leave every test the empty tables the migrations describe."""
    yield
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        truncate_all_tables(connection)
    engine.dispose()


@pytest.fixture
def unmigrated_database(test_database: None, settings: Settings) -> None:
    """The database as a fresh deployment finds it: no tables, no version."""
    recreate_database(settings, settings.postgres_db)


class FakeClock:
    """A clock the test moves by hand.

    Everything sign-in refuses, it refuses because of a deadline, and no test
    can afford to wait for one.
    """

    def __init__(self) -> None:
        self.reading = utc_now()

    def __call__(self) -> datetime:
        return self.reading

    def advance(self, by: timedelta) -> None:
        self.reading += by


@pytest.fixture
def mailer() -> RecordingMailer:
    return RecordingMailer()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def worker() -> RecordingWorker:
    return RecordingWorker()


@pytest.fixture
def client(
    mailer: RecordingMailer, clock: FakeClock, worker: RecordingWorker
) -> Iterator[TestClient]:
    """The api, started as it starts in production — migrations included.

    Only what the outside world would otherwise supply is replaced: the mail
    it sends, the time it reads, and the render worker it asks about the
    inside of a document or a font file. Postgres and object storage are the
    real ones the compose file starts.
    """
    with TestClient(app) as started:
        started.app.state.mailer = mailer
        started.app.state.clock = clock
        started.app.state.worker = worker
        yield started


type Join = Callable[[str, "Account", str], None]


@dataclass(frozen=True)
class Account:
    """Someone who has signed in, and the cookie that proves it."""

    id: str
    email: str
    token: str


class Accounts:
    """Signs people in, and decides which of them the client is right now.

    One client carries one cookie, so a test with several people in it says
    whose turn it is rather than opening a browser each.
    """

    def __init__(self, client: TestClient, mailer: RecordingMailer) -> None:
        self.client = client
        self.mailer = mailer

    def sign_in(self, email: str) -> Account:
        """Take an address all the way to a session, and act as it."""
        self.client.cookies.clear()
        self.client.post("/api/v1/auth/otp/request", json={"email": email})
        verified = self.client.post(
            "/api/v1/auth/otp/verify",
            json={"email": email, "code": self.mailer.otps[-1].code},
        )
        assert verified.status_code == 204, verified.text
        user = self.client.get("/api/v1/me").json()["user"]
        return Account(
            id=user["id"], email=user["email"], token=self.client.cookies[COOKIE_NAME]
        )

    def acting_as(self, account: Account) -> None:
        self.client.cookies.clear()
        self.client.cookies.set(COOKIE_NAME, account.token)


@pytest.fixture
def accounts(client: TestClient, mailer: RecordingMailer) -> Accounts:
    return Accounts(client, mailer)


@pytest.fixture
def joining(stored: Engine) -> Join:
    """Put someone into a Workspace with a Role, directly.

    A Workspace Invite is the product's only way in, and it is a slice of its
    own; until it exists, a test that needs a second member writes the
    Membership itself. Arrangement only — every claim is still made at the
    HTTP seam.
    """

    def join(workspace_id: str, account: Account, role: str) -> None:
        with stored.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO memberships (workspace_id, user_id, role, created_at)"
                    " VALUES (:workspace, :user, :role, now())"
                ),
                {"workspace": workspace_id, "user": account.id, "role": role},
            )

    return join


@pytest.fixture
def stored(settings: Settings) -> Iterator[Engine]:
    """The test database, for the claims that only the tables can answer."""
    engine = create_engine(settings.database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def empty_database(settings: Settings) -> Iterator[Engine]:
    """A database of its own, with nothing in it — not even a schema version."""
    name = f"{settings.postgres_db}_empty"
    recreate_database(settings, name)
    engine = create_engine(settings.database_url.set(database=name))
    yield engine
    engine.dispose()
    drop_database(settings, name)


def recreate_database(settings: Settings, name: str) -> None:
    with maintenance_connection(settings) as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{name}"'))


def drop_database(settings: Settings, name: str) -> None:
    with maintenance_connection(settings) as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


@contextmanager
def maintenance_connection(settings: Settings) -> Iterator[Connection]:
    """A connection to the server itself, outside any of its databases."""
    engine = create_engine(
        settings.database_url.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with engine.connect() as connection:
            yield connection
    except OperationalError as unreachable:
        raise pytest.UsageError(
            UNREACHABLE.format(host=settings.postgres_host, port=settings.postgres_port)
        ) from unreachable
    finally:
        engine.dispose()


def truncate_all_tables(connection: Connection) -> None:
    names = connection.execute(
        text(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        )
    ).scalars()
    tables = ", ".join(f'"{name}"' for name in names)
    if tables:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def objects(client: TestClient) -> ObjectStore:
    """The store the api built for itself, with its buckets already made."""
    return client.app.state.storage


@pytest.fixture
def s3(settings: Settings) -> BaseClient:
    """The object store itself, for the claims the seam cannot make about it."""
    return storage_client(settings)


@pytest.fixture(autouse=True)
def clean_queue(settings: Settings) -> Iterator[None]:
    """Leave Redis empty, on the test database only.

    A Redis that cannot be reached is not this fixture's problem: job
    submission will say so when it tries to enqueue. Everything else the
    api does still runs without a queue.
    """
    yield
    with suppress(OSError):
        flush_redis(settings)


def flush_redis(settings: Settings) -> None:
    if settings.redis_host.startswith("/"):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(settings.redis_host)
    else:
        sock = socket.create_connection((settings.redis_host, settings.redis_port))
    try:
        if settings.redis_db:
            sock.sendall(_resp("SELECT", str(settings.redis_db)))
            _discard_reply(sock)
        sock.sendall(_resp("FLUSHDB"))
        _discard_reply(sock)
    finally:
        sock.close()


def _resp(*parts: str) -> bytes:
    payload = f"*{len(parts)}\r\n".encode()
    for part in parts:
        encoded = part.encode()
        payload += f"${len(encoded)}\r\n".encode() + encoded + b"\r\n"
    return payload


def _discard_reply(sock: socket.socket) -> None:
    buf = b""
    while not buf.endswith(b"\r\n"):
        chunk = sock.recv(64)
        if not chunk:
            break
        buf += chunk


@pytest.fixture(autouse=True)
def clean_storage(settings: Settings) -> Iterator[None]:
    """Leave every test empty buckets.

    The emptying goes to the store directly rather than through the seam, so
    that a broken prefix delete fails its own test instead of hiding in the
    fixture that cleans up after it.
    """
    yield
    client = storage_client(settings)
    for bucket in (settings.assets_bucket, settings.outputs_bucket):
        try:
            listing = client.list_objects_v2(Bucket=bucket)
        except ClientError:
            continue
        except BotoCoreError as unreachable:
            raise pytest.UsageError(
                NO_STORE.format(endpoint=settings.storage_endpoint)
            ) from unreachable
        for stored in listing.get("Contents", ()):
            client.delete_object(Bucket=bucket, Key=stored["Key"])


def storage_client(settings: Settings) -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=settings.storage_endpoint,
        region_name=settings.storage_region,
        aws_access_key_id=settings.storage_access_key,
        aws_secret_access_key=settings.storage_secret_key,
    )
