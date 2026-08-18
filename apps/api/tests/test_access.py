"""The Role gate, proved the way a later route will use it.

The rest of the product's Workspace-scoped routes do not exist yet, so this
declares one — and the declaration below is the whole of what such a route
writes about access: a parameter, no lookup, and no comparison.
"""

from collections.abc import Iterator

import pytest
from conftest import Accounts, FakeClock, Join
from fastapi import FastAPI
from fastapi.testclient import TestClient
from media_canvas_api import auth, workspaces
from media_canvas_api.access import AccessMiddleware, Editing
from media_canvas_api.mailer import RecordingMailer
from media_canvas_api.main import lifespan


@pytest.fixture
def gated(mailer: RecordingMailer, clock: FakeClock) -> Iterator[TestClient]:
    """The api, with one more route on it: one that requires an Editor."""
    api = FastAPI(lifespan=lifespan)
    api.include_router(auth.router)
    api.include_router(workspaces.router)

    @api.get("/api/v1/workspaces/{workspaceId}/probe")
    async def probe(membership: Editing) -> dict[str, str]:
        return {"role": membership.role}

    api.add_middleware(AccessMiddleware)
    with TestClient(api) as started:
        started.app.state.mailer = mailer
        started.app.state.clock = clock
        yield started


def test_a_route_that_asks_for_an_editor_admits_that_role_and_the_one_above(
    gated: TestClient, mailer: RecordingMailer, joining: Join
) -> None:
    accounts = Accounts(gated, mailer)
    people = {
        role: accounts.sign_in(f"{role}@example.com")
        for role in ("owner", "editor", "viewer")
    }
    accounts.acting_as(people["owner"])
    workspace = gated.post("/api/v1/workspaces", json={"name": "Studio"}).json()["id"]
    for role in ("editor", "viewer"):
        joining(workspace, people[role], role)

    answers = {}
    for role, person in people.items():
        accounts.acting_as(person)
        answers[role] = gated.get(f"/api/v1/workspaces/{workspace}/probe").status_code

    assert answers == {"owner": 200, "editor": 200, "viewer": 403}
