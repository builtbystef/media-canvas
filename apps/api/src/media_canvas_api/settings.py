"""Configuration, read from the environment once at startup.

A missing or unreadable value fails here, with the name of the variable that
needs attention — not at the first request that happens to need it.
"""

from functools import cache
from pathlib import Path

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# Where `pnpm dev` serves the editor: the address a developer opens, and so
# also the origin the api answers cross-origin calls from.
DEVELOPMENT_ORIGIN = "http://localhost:3000"


class SettingsError(RuntimeError):
    """The environment does not describe a runnable api."""


class Settings(BaseSettings):
    """Every value the api reads from its environment.

    Only the Postgres password and the object storage credential are
    required: the rest default to the compose stack, so a developer who has
    started the infra containers needs nothing else.
    """

    model_config = SettingsConfigDict(
        case_sensitive=False, extra="ignore", populate_by_name=True
    )

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "media_canvas"
    postgres_password: str
    postgres_db: str = "media_canvas"

    # The credential is the pair the object store itself is booted with, under
    # the names it reads: one credential, set once, used from both ends. Every
    # other detail is the api's own, and the defaults describe the compose
    # stack — a hosted deployment points the same code at another S3 by
    # setting the endpoint and the region.
    storage_access_key: str = Field(validation_alias="garage_default_access_key")
    storage_secret_key: str = Field(validation_alias="garage_default_secret_key")
    storage_endpoint: str = "http://localhost:3900"
    storage_region: str = "garage"
    assets_bucket: str = "media-canvas-assets"
    outputs_bucket: str = "media-canvas-outputs"

    domain: str | None = None
    public_url: str | None = None

    @property
    def public_base_url(self) -> str:
        """The absolute base the product is reached at.

        A domain means HTTPS with certificates the proxy obtains itself; an
        explicit base covers everything else a deployer might front it with;
        and with neither, this is a development machine, where the editor's
        own dev server is the address people open.
        """
        if self.domain:
            return f"https://{self.domain}"
        if self.public_url:
            return self.public_url.rstrip("/")
        return DEVELOPMENT_ORIGIN

    @property
    def development_origin(self) -> str | None:
        """The origin to accept credentialed cross-origin calls from.

        A deployed stack serves the editor and the api from one origin behind
        the proxy, so it needs no cross-origin headers at all and sends none.
        Development is the only case where the two are apart, and then the
        editor's dev server is the single origin that is allowed.
        """
        if self.domain or self.public_url:
            return None
        return DEVELOPMENT_ORIGIN

    @property
    def cookies_require_https(self) -> bool:
        return self.public_base_url.startswith("https://")

    @property
    def database_url(self) -> URL:
        """The SQLAlchemy URL of the api's database.

        The psycopg driver serves both engine kinds: async for the app,
        synchronous for Alembic.
        """
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


def find_env_file(start: Path | None = None) -> Path | None:
    """The nearest `.env` at or above `start`, if there is one.

    Development runs the api from its own package directory while `.env` sits
    at the repository root; a container has no `.env` at all and passes the
    same values as real environment variables.
    """
    here = (start or Path.cwd()).resolve()
    for directory in (here, *here.parents):
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None


def load_settings(env_file: Path | None = None) -> Settings:
    """Read the settings, or fail naming the variable that is at fault."""
    try:
        return Settings(_env_file=env_file)
    except ValidationError as invalid:
        raise SettingsError(_describe(invalid)) from invalid


def _describe(invalid: ValidationError) -> str:
    problems = [
        f"{str(error['loc'][0]).upper()}: {error['msg'].lower()}"
        for error in invalid.errors()
        if error["loc"]
    ]
    return (
        "The environment does not describe a runnable api — "
        + "; ".join(problems)
        + ". Copy .env.example to .env and fill in the values it marks required."
    )


@cache
def get_settings() -> Settings:
    """The process-wide settings, read from the environment on first use."""
    return load_settings(env_file=find_env_file())
