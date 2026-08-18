"""Which origin the browser may reach the api from.

Development runs the editor and the api on two ports; a deployment puts them
behind one proxy, and then there is nothing cross-origin left to allow.
"""

from fastapi.testclient import TestClient
from media_canvas_api.settings import DEVELOPMENT_ORIGIN


def test_the_editors_development_origin_may_sign_in_with_credentials(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/auth/otp/request",
        json={"email": "alice@example.com"},
        headers={"Origin": DEVELOPMENT_ORIGIN},
    )

    assert response.headers["access-control-allow-origin"] == DEVELOPMENT_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_no_other_origin_is_answered(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/otp/request",
        json={"email": "alice@example.com"},
        headers={"Origin": "http://elsewhere.example"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_a_deployment_serving_one_origin_sends_no_cross_origin_headers(
    client: TestClient,
) -> None:
    settings = client.app.state.settings
    client.app.state.settings = settings.model_copy(update={"domain": "canvas.example"})

    response = client.post(
        "/api/v1/auth/otp/request",
        json={"email": "alice@example.com"},
        headers={"Origin": "https://canvas.example"},
    )

    assert response.status_code == 204
    assert not [name for name in response.headers if name.startswith("access-control")]
