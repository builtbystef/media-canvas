"""Configuration, read from the environment once at startup.

A missing or unreadable value fails here, with the name of the variable that
needs attention — not at the first request that happens to need it.
"""

from functools import cache
from pathlib import Path

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class SettingsError(RuntimeError):
    """The environment does not describe a runnable api."""


class Settings(BaseSettings):
    """Every value the api reads from its environment.

    Only the Postgres password is required: the rest default to the compose
    stack's own Postgres, so a developer who has started the infra containers
    needs nothing else.
    """

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "media_canvas"
    postgres_password: str
    postgres_db: str = "media_canvas"

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
