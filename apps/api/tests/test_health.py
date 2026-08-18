import pytest
from fastapi.testclient import TestClient
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.main import app
from media_canvas_api.settings import get_settings
from test_auth import sign_in


def test_health_reports_a_reachable_and_migrated_database(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": {"connected": True, "schema_at_head": True},
    }


def test_starting_the_api_applies_pending_migrations_before_it_serves(
    unmigrated_database: None,
) -> None:
    with TestClient(app) as started:
        response = started.get("/api/health")

    assert response.json()["database"] == {"connected": True, "schema_at_head": True}


def test_health_reports_an_unreachable_database_and_keeps_serving(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PORT", "1")
    get_settings.cache_clear()

    try:
        with TestClient(app) as started:
            response = started.get("/api/health")

            assert response.status_code == 200
            assert response.json() == {
                "status": "degraded",
                "database": {"connected": False, "schema_at_head": False},
            }
            assert started.get("/api/health").status_code == 200
    finally:
        get_settings.cache_clear()


def test_greeting(client: TestClient, mailer: RecordingMailer) -> None:
    sign_in(client, mailer, "alice@example.com")

    response = client.get("/api/hello/media-canvas")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, media-canvas!"}
