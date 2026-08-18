import pytest
from media_canvas_api.settings import Settings, SettingsError, load_settings

DEFAULTED = (
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "POSTGRES_DB",
    "STORAGE_ENDPOINT",
    "STORAGE_REGION",
    "ASSETS_BUCKET",
    "OUTPUTS_BUCKET",
)


def test_missing_required_variable_fails_naming_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

    with pytest.raises(SettingsError) as failure:
        load_settings(env_file=None)

    assert "POSTGRES_PASSWORD" in str(failure.value)


def test_a_missing_object_storage_credential_fails_naming_its_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.delenv("GARAGE_DEFAULT_SECRET_KEY", raising=False)

    with pytest.raises(SettingsError) as failure:
        load_settings(env_file=None)

    assert "GARAGE_DEFAULT_SECRET_KEY" in str(failure.value)


def test_defaults_leave_only_the_secrets_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("GARAGE_DEFAULT_ACCESS_KEY", "key")
    monkeypatch.setenv("GARAGE_DEFAULT_SECRET_KEY", "another-secret")
    for name in DEFAULTED:
        monkeypatch.delenv(name, raising=False)

    settings = load_settings(env_file=None)

    assert settings == Settings(
        postgres_host="localhost",
        postgres_port=5432,
        postgres_user="media_canvas",
        postgres_password="secret",
        postgres_db="media_canvas",
        storage_access_key="key",
        storage_secret_key="another-secret",
        storage_endpoint="http://localhost:3900",
        storage_region="garage",
        assets_bucket="media-canvas-assets",
        outputs_bucket="media-canvas-outputs",
    )


def test_an_unreadable_value_fails_naming_its_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("GARAGE_DEFAULT_ACCESS_KEY", "key")
    monkeypatch.setenv("GARAGE_DEFAULT_SECRET_KEY", "another-secret")
    monkeypatch.setenv("POSTGRES_PORT", "not-a-port")

    with pytest.raises(SettingsError) as failure:
        load_settings(env_file=None)

    assert "POSTGRES_PORT" in str(failure.value)
