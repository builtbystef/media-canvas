"""The bytes the api holds, and how they come back out.

Object storage has no public route yet, so these read the seam every later
byte-holding feature is built on — against the real store the compose file
starts, because a fake S3 would only prove the fake.
"""

from botocore.client import BaseClient
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from media_canvas_api.main import app
from media_canvas_api.settings import Settings
from media_canvas_api.storage import ObjectStore, serve


def test_bytes_written_under_a_key_come_back_with_their_content_type(
    objects: ObjectStore,
) -> None:
    objects.assets.put("fonts/inter.ttf", b"\x00\x01ttf", content_type="font/ttf")

    stored = objects.assets.open("fonts/inter.ttf")

    assert stored is not None
    assert stored.read() == b"\x00\x01ttf"
    assert stored.content_type == "font/ttf"


def test_reading_a_key_the_store_does_not_hold_is_an_answer_not_a_failure(
    objects: ObjectStore,
) -> None:
    assert objects.assets.open("images/never-uploaded.png") is None


def test_a_deleted_key_is_gone_and_its_neighbours_stay(objects: ObjectStore) -> None:
    objects.assets.put("images/keep.png", b"keep", content_type="image/png")
    objects.assets.put("images/drop.png", b"drop", content_type="image/png")

    objects.assets.delete("images/drop.png")

    assert objects.assets.open("images/drop.png") is None
    assert objects.assets.open("images/keep.png") is not None


def test_deleting_a_prefix_takes_everything_under_it_and_nothing_beside_it(
    objects: ObjectStore,
) -> None:
    for name in ("one.png", "two.png", "three.png"):
        objects.outputs.put(f"jobs/doomed/{name}", b"out", content_type="image/png")
    objects.outputs.put("jobs/other/one.png", b"out", content_type="image/png")

    objects.outputs.delete_prefix("jobs/doomed/")

    for name in ("one.png", "two.png", "three.png"):
        assert objects.outputs.open(f"jobs/doomed/{name}") is None
    assert objects.outputs.open("jobs/other/one.png") is not None


def test_deleting_a_prefix_that_holds_nothing_is_no_error(
    objects: ObjectStore,
) -> None:
    objects.outputs.delete_prefix("jobs/never-rendered/")


def test_the_buckets_the_product_needs_exist_once_the_api_has_started(
    client: TestClient, s3: BaseClient, settings: Settings
) -> None:
    made = {bucket["Name"] for bucket in s3.list_buckets()["Buckets"]}

    assert {settings.assets_bucket, settings.outputs_bucket} <= made


def test_starting_again_against_the_same_storage_changes_nothing(
    objects: ObjectStore,
) -> None:
    objects.assets.put("images/kept.png", b"kept", content_type="image/png")

    with TestClient(app):
        pass

    stored = objects.assets.open("images/kept.png")
    assert stored is not None
    assert stored.read() == b"kept"


def test_an_object_is_read_in_pieces_rather_than_held_whole(
    objects: ObjectStore,
) -> None:
    picture = bytes(range(256)) * 800
    objects.outputs.put("jobs/1/card.png", picture, content_type="image/png")

    stored = objects.outputs.open("jobs/1/card.png")

    assert stored is not None
    pieces = list(stored.chunks())
    assert max(len(piece) for piece in pieces) < len(picture)
    assert b"".join(pieces) == picture


def test_stored_bytes_reach_a_client_carrying_their_content_type(
    objects: ObjectStore,
) -> None:
    picture = bytes(range(256)) * 800
    objects.outputs.put("jobs/1/card.png", picture, content_type="image/png")

    response = TestClient(serving(objects)).get("/jobs/1/card.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == picture


def test_a_client_asking_for_a_key_the_store_does_not_hold_is_told_so(
    objects: ObjectStore,
) -> None:
    response = TestClient(serving(objects)).get("/jobs/1/never-rendered.png")

    assert response.status_code == 404


def serving(objects: ObjectStore) -> FastAPI:
    """An api that serves one bucket, standing in for the routes to come.

    The path from storage to a client is the thing under test; the route in
    front of it belongs to the features that will use it.
    """
    api = FastAPI()

    @api.get("/{key:path}")
    def read(key: str) -> StreamingResponse:
        return serve(objects.outputs, key)

    return api
