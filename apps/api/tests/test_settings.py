import pytest
from media_canvas_api.settings import Settings, SettingsError, load_settings


def test_missing_required_variable_fails_naming_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

    with pytest.raises(SettingsError) as failure:
        load_settings(env_file=None)

    assert "POSTGRES_PASSWORD" in str(failure.value)


def test_defaults_leave_only_the_password_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    for name in ("POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_DB"):
        monkeypatch.delenv(name, raising=False)

    settings = load_settings(env_file=None)

    assert settings == Settings(
        postgres_host="localhost",
        postgres_port=5432,
        postgres_user="media_canvas",
        postgres_password="secret",
        postgres_db="media_canvas",
    )


def test_an_unreadable_value_fails_naming_its_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_PORT", "not-a-port")

    with pytest.raises(SettingsError) as failure:
        load_settings(env_file=None)

    assert "POSTGRES_PORT" in str(failure.value)
