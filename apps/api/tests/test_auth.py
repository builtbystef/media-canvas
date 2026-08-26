from datetime import timedelta

from conftest import Accounts, FakeClock
from fastapi.testclient import TestClient
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.otp import BURST_WINDOW


def test_requesting_a_code_answers_204_and_mails_six_digits(
    client: TestClient, mailer: RecordingMailer
) -> None:
    response = client.post(
        "/api/v1/auth/otp/request", json={"email": "alice@example.com"}
    )

    assert response.status_code == 204
    assert [(sent.to, sent.code.isdigit(), len(sent.code)) for sent in mailer.otps] == [
        ("alice@example.com", True, 6)
    ]


def test_verifying_a_code_signs_in_and_the_same_code_is_then_gone(
    client: TestClient, mailer: RecordingMailer
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    code = mailer.otps[-1].code

    accepted = client.post(
        "/api/v1/auth/otp/verify", json={"email": "alice@example.com", "code": code}
    )
    replayed = client.post(
        "/api/v1/auth/otp/verify", json={"email": "alice@example.com", "code": code}
    )

    assert accepted.status_code == 204
    assert client.cookies.get("media_canvas_session")
    assert replayed.status_code == 410


def test_a_code_stops_working_ten_minutes_after_it_was_asked_for(
    client: TestClient, mailer: RecordingMailer, clock: FakeClock
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    clock.advance(timedelta(minutes=10, seconds=1))

    response = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": "alice@example.com", "code": mailer.otps[-1].code},
    )

    assert response.status_code == 410
    assert not client.cookies.get("media_canvas_session")


def test_a_code_survives_five_wrong_guesses_and_no_more(
    client: TestClient, mailer: RecordingMailer, clock: FakeClock
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    code = mailer.otps[-1].code
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"

    refusals = [
        client.post(
            "/api/v1/auth/otp/verify",
            json={"email": "alice@example.com", "code": wrong},
        ).status_code
        for _ in range(5)
    ]
    exhausted = client.post(
        "/api/v1/auth/otp/verify", json={"email": "alice@example.com", "code": code}
    )

    clock.advance(BURST_WINDOW)
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    afresh = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": "alice@example.com", "code": mailer.otps[-1].code},
    )

    assert refusals == [401] * 5
    assert exhausted.status_code == 410
    assert afresh.status_code == 204


def test_a_second_code_within_thirty_seconds_is_refused(client: TestClient) -> None:
    first = client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    second = client.post(
        "/api/v1/auth/otp/request", json={"email": "alice@example.com"}
    )

    assert (first.status_code, second.status_code) == (204, 429)


def test_the_eleventh_code_within_an_hour_is_refused(
    client: TestClient, clock: FakeClock
) -> None:
    answers = []
    for _ in range(11):
        answers.append(
            client.post(
                "/api/v1/auth/otp/request", json={"email": "alice@example.com"}
            ).status_code
        )
        clock.advance(BURST_WINDOW + timedelta(seconds=1))

    assert answers == [204] * 10 + [429]


def test_the_limit_lets_go_once_the_hour_has_passed(
    client: TestClient, clock: FakeClock
) -> None:
    for _ in range(10):
        client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
        clock.advance(BURST_WINDOW + timedelta(seconds=1))
    clock.advance(timedelta(hours=1))

    response = client.post(
        "/api/v1/auth/otp/request", json={"email": "alice@example.com"}
    )

    assert response.status_code == 204


def test_asking_for_a_code_answers_the_same_way_for_a_known_and_an_unknown_address(
    client: TestClient, mailer: RecordingMailer, clock: FakeClock
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})
    client.post(
        "/api/v1/auth/otp/verify",
        json={"email": "alice@example.com", "code": mailer.otps[-1].code},
    )
    clock.advance(BURST_WINDOW + timedelta(seconds=1))

    registered = client.post(
        "/api/v1/auth/otp/request", json={"email": "alice@example.com"}
    )
    stranger = client.post(
        "/api/v1/auth/otp/request", json={"email": "nobody@example.com"}
    )

    assert (registered.status_code, registered.text) == (204, "")
    assert (stranger.status_code, stranger.text) == (204, "")


def test_one_address_is_one_user_however_it_was_typed(
    accounts: Accounts, clock: FakeClock
) -> None:
    shouted = accounts.sign_in("Alice@Example.COM")
    clock.advance(BURST_WINDOW + timedelta(seconds=1))
    quiet = accounts.sign_in("alice@example.com")

    assert shouted.id == quiet.id
    assert quiet.email == "alice@example.com"


def test_me_answers_with_the_signed_in_user_and_no_memberships_yet(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")

    response = client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json()["memberships"] == []
    assert response.json()["user"]["email"] == "alice@example.com"


def test_logging_out_leaves_the_cookie_meaningless(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    token = client.cookies["media_canvas_session"]

    client.post("/api/v1/auth/logout")
    client.cookies.set("media_canvas_session", token)

    assert client.get("/api/v1/me").status_code == 401


def test_the_session_cookie_is_opaque_http_only_and_same_site_lax(
    client: TestClient, mailer: RecordingMailer
) -> None:
    client.post("/api/v1/auth/otp/request", json={"email": "alice@example.com"})

    verified = client.post(
        "/api/v1/auth/otp/verify",
        json={"email": "alice@example.com", "code": mailer.otps[-1].code},
    )

    cookie = verified.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "alice" not in cookie


def test_using_a_session_rolls_it_thirty_days_on_but_writes_once_a_day(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")

    same_day = client.get("/api/v1/me")
    clock.advance(timedelta(days=29))
    next_month = client.get("/api/v1/me")
    clock.advance(timedelta(days=29))
    month_after = client.get("/api/v1/me")

    assert "set-cookie" not in same_day.headers
    assert "set-cookie" in next_month.headers
    assert month_after.status_code == 200


def test_a_session_left_alone_for_thirty_days_stops_working(
    client: TestClient, accounts: Accounts, clock: FakeClock
) -> None:
    accounts.sign_in("alice@example.com")

    clock.advance(timedelta(days=30, seconds=1))

    assert client.get("/api/v1/me").status_code == 401


def test_no_route_answers_without_a_session_but_the_public_ones(
    client: TestClient,
) -> None:
    answered = {
        (method, path)
        for path, operations in client.app.openapi()["paths"].items()
        for method in operations
        if client.request(method, path.replace("{name}", "probe")).status_code != 401
    }

    assert answered == {
        ("get", "/api/health"),
        ("post", "/api/v1/auth/otp/request"),
        ("post", "/api/v1/auth/otp/verify"),
        ("get", "/api/v1/invites/{token}"),
        ("post", "/api/v1/invites/{token}/accept"),
    }


def test_the_schema_and_its_documentation_need_a_session_like_everything_else(
    client: TestClient,
) -> None:
    refused = {
        path: client.get(path).status_code for path in ("/openapi.json", "/docs")
    }

    assert refused == {"/openapi.json": 401, "/docs": 401}


def test_a_path_that_does_not_exist_tells_a_stranger_nothing(
    client: TestClient,
) -> None:
    assert client.get("/api/v1/workspaces").status_code == 401
