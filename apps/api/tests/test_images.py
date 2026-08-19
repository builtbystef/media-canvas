"""Image Asset upload: what is stored is what will be rendered.

Every claim is made at the HTTP seam the editor uses, against the object
storage the compose stack starts. Images are the one asset kind the api
inspects itself, so nothing here is faked: the pictures are built with the
same library that reads them back.
"""

import struct
import zlib
from hashlib import sha256
from io import BytesIO
from typing import Any

from botocore.client import BaseClient
from conftest import Accounts, Join
from fastapi.testclient import TestClient
from media_canvas_api.storage import ObjectStore
from PIL import Image
from sqlalchemy import Engine, text


def a_picture(
    size: tuple[int, int] = (40, 30),
    image_format: str = "PNG",
    **saved: Any,
) -> bytes:
    """A picture of a colour, as a file of the named format."""
    drawn = Image.new("RGB", size, (200, 30, 30))
    written = BytesIO()
    drawn.save(written, format=image_format, **saved)
    return written.getvalue()


def a_workspace(client: TestClient, name: str = "Studio") -> str:
    created = client.post("/api/v1/workspaces", json={"name": name})
    assert created.status_code == 201, created.text
    workspace: str = created.json()["id"]
    return workspace


def upload(
    client: TestClient,
    workspace: str,
    image: bytes,
    filename: str = "photo.png",
    content_type: str = "image/png",
) -> Any:
    return client.post(
        f"/api/v1/workspaces/{workspace}/images",
        files={"file": (filename, image, content_type)},
    )


def test_an_uploaded_image_is_recorded_as_the_picture_it_holds(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(client, workspace, a_picture(), filename="a-logo.png")

    assert created.status_code == 201, created.text
    record = created.json()
    assert record.pop("createdAt")
    assert record == {
        "id": record["id"],
        "contentType": "image/png",
        "width": 40,
        "height": 30,
        "byteSize": record["byteSize"],
        "originalFilename": "a-logo.png",
    }


def test_the_id_names_the_bytes_that_were_stored(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    """The worker verifies the hash on load, so the id has to be the hash of
    what it will download — not of what the upload happened to carry."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(client, workspace, a_picture())

    record = created.json()
    stored = objects.assets.open(f"{workspace}/images/{record['id']}.png")
    assert stored is not None
    assert stored.content_type == "image/png"
    kept = stored.read()
    assert sha256(kept).hexdigest() == record["id"]
    assert len(kept) == record["byteSize"]


EXIF_MAKE = 271
EXIF_ORIENTATION = 274
EXIF_SOFTWARE = 305
EXIF_GPS = 0x8825


def a_photograph(
    size: tuple[int, int] = (40, 30), software: str = "ACME Camera 1.0"
) -> bytes:
    """A JPEG as a phone writes one: the pixels lie one way, the orientation
    flag says the picture is a quarter-turn from them, and the camera has
    written down what it is and where it stood."""
    exif = Image.Exif()
    exif[EXIF_MAKE] = "ACME Telephones"
    exif[EXIF_ORIENTATION] = 6
    exif[EXIF_SOFTWARE] = software
    exif[EXIF_GPS] = {1: "N", 2: (51.0, 30.0, 0.0)}
    return a_picture(size, "JPEG", exif=exif)


def test_a_photograph_flagged_as_rotated_is_stored_and_recorded_upright(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    """The worked example, in miniature: a photo whose flag makes it 40 by 30
    on disk but upright at 30 by 40 is stored upright and recorded as 30 by
    40. Anything else authors it sideways in a wrongly shaped frame."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(
        client,
        workspace,
        a_photograph(),
        filename="IMG_0042.jpg",
        content_type="image/jpeg",
    )

    record = created.json()
    assert (record["width"], record["height"]) == (30, 40)
    stored = objects.assets.open(f"{workspace}/images/{record['id']}.jpg")
    assert stored is not None
    assert Image.open(BytesIO(stored.read())).size == (30, 40)


def test_the_camera_and_location_data_of_a_photograph_are_never_stored(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    """What is not stored cannot be proxied back out to whoever holds the URL."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    photograph = a_photograph()
    assert b"ACME Telephones" in photograph

    created = upload(
        client,
        workspace,
        photograph,
        filename="IMG_0042.jpg",
        content_type="image/jpeg",
    )

    stored = objects.assets.open(f"{workspace}/images/{created.json()['id']}.jpg")
    assert stored is not None
    kept = stored.read()
    assert b"ACME Telephones" not in kept
    assert dict(Image.open(BytesIO(kept)).getexif()) == {}


def test_two_files_that_normalize_to_the_same_picture_are_one_asset(
    client: TestClient, accounts: Accounts, s3: BaseClient, stored: Engine
) -> None:
    """Normalization comes before the duplicate check, so the same photograph
    sent twice — differing only in the metadata that is dropped — returns the
    record already held and creates nothing."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    assert a_photograph() != a_photograph(software="Some Other Camera App")

    first = upload(client, workspace, a_photograph(), content_type="image/jpeg")
    again = upload(
        client,
        workspace,
        a_photograph(software="Some Other Camera App"),
        filename="a-second-name.jpg",
        content_type="image/jpeg",
    )

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json() == first.json()
    assert len(s3.list_objects_v2(Bucket=stored_bucket(client))["Contents"]) == 1
    with stored.begin() as connection:
        assert (
            connection.execute(text("SELECT count(*) FROM image_assets")).scalar() == 1
        )


def test_an_image_is_identified_by_its_bytes_so_two_workspaces_hold_it_twice(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    accounts.sign_in("alice@example.com")
    one = a_workspace(client, "Studio")
    other = a_workspace(client, "Agency")

    here = upload(client, one, a_picture())
    there = upload(client, other, a_picture())

    assert here.json()["id"] == there.json()["id"]
    assert there.status_code == 201, there.text
    for workspace in (one, other):
        assert (
            objects.assets.open(f"{workspace}/images/{here.json()['id']}.png")
            is not None
        )


def test_the_format_is_what_the_file_is_and_not_what_the_upload_called_it(
    client: TestClient, accounts: Accounts, objects: ObjectStore
) -> None:
    """The worked example: a file named as a PNG that parses as JPEG is stored
    as JPEG, under the matching key."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(
        client,
        workspace,
        a_picture(image_format="JPEG"),
        filename="misnamed.png",
        content_type="image/png",
    )

    record = created.json()
    assert record["contentType"] == "image/jpeg"
    stored = objects.assets.open(f"{workspace}/images/{record['id']}.jpg")
    assert stored is not None
    assert stored.content_type == "image/jpeg"


def stored_bucket(client: TestClient) -> str:
    bucket: str = client.app.state.settings.assets_bucket
    return bucket


def test_a_webp_is_taken_like_any_other_picture(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    created = upload(
        client,
        workspace,
        a_picture(image_format="WEBP"),
        filename="a-logo.webp",
        content_type="image/webp",
    )

    assert created.status_code == 201, created.text
    assert created.json()["contentType"] == "image/webp"


def test_a_format_this_product_does_not_take_is_refused_by_name(
    client: TestClient, accounts: Accounts, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = upload(
        client,
        workspace,
        a_picture(image_format="GIF"),
        filename="dancing.gif",
        content_type="image/gif",
    )

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "unsupported_image_format"
    assert "PNG" in refused.json()["error"]["message"]
    assert nothing_stored(client, s3)


def test_a_file_that_is_no_image_at_all_is_refused_for_its_format(
    client: TestClient, accounts: Accounts, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = upload(client, workspace, b"<svg xmlns='http://www.w3.org/2000/svg'/>")

    assert refused.json()["error"]["code"] == "unsupported_image_format"
    assert nothing_stored(client, s3)


def test_an_image_past_the_size_limit_is_refused_for_its_size(
    client: TestClient, accounts: Accounts, s3: BaseClient
) -> None:
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = upload(
        client, workspace, b"\x89PNG\r\n\x1a\n" + b"\x00" * (25 * 1024 * 1024)
    )

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "file_too_large"
    assert nothing_stored(client, s3)


def test_a_small_file_that_decodes_to_too_many_pixels_is_refused_for_that(
    client: TestClient, accounts: Accounts, s3: BaseClient
) -> None:
    """The worked example: what protects the renderer is the pixel count, and
    a file well under the size limit can carry far too many of them."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)
    enormous = a_picture(size=(9000, 7000))
    assert len(enormous) < 25 * 1024 * 1024

    refused = upload(client, workspace, enormous)

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "image_too_many_pixels"
    assert "megapixels" in refused.json()["error"]["message"]
    assert nothing_stored(client, s3)


def test_a_picture_too_large_to_open_at_all_is_refused_for_its_pixels(
    client: TestClient, accounts: Accounts, s3: BaseClient
) -> None:
    """A header claiming more pixels than the library will decode under any
    circumstances is the same complaint, and must not become a fault."""
    accounts.sign_in("alice@example.com")
    workspace = a_workspace(client)

    refused = upload(client, workspace, a_png_header_claiming(20_000, 10_000))

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "image_too_many_pixels"
    assert nothing_stored(client, s3)


def a_png_header_claiming(width: int, height: int) -> bytes:
    """A PNG whose header says it is enormous, and which holds nothing.

    Written by hand because the picture it claims to be would not fit in
    memory — which is the whole reason the header is read before the pixels.
    """

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data))
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"\x00" * 64))
        + chunk(b"IEND", b"")
    )


def nothing_stored(client: TestClient, s3: BaseClient) -> bool:
    """Whether the assets bucket is as empty as it was before the upload.

    A refused image reaches storage at no point — there is no quarantine area
    and nothing to sweep later — so the claim is about the whole bucket rather
    than about one key.
    """
    return "Contents" not in s3.list_objects_v2(Bucket=stored_bucket(client))


def test_uploading_an_image_takes_an_editor_and_a_viewer_is_refused(
    client: TestClient, accounts: Accounts, joining: Join
) -> None:
    owner = accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)
    watcher = accounts.sign_in("watcher@example.com")
    joining(workspace, watcher, "viewer")

    accounts.acting_as(watcher)
    refused = upload(client, workspace, a_picture())
    accounts.acting_as(owner)
    allowed = upload(client, workspace, a_picture())

    assert refused.status_code == 403
    assert allowed.status_code == 201


def test_somebody_outside_the_workspace_is_told_only_that_there_is_no_such_workspace(
    client: TestClient, accounts: Accounts
) -> None:
    accounts.sign_in("owner@example.com")
    workspace = a_workspace(client)

    accounts.sign_in("stranger@example.com")
    refused = upload(client, workspace, a_picture())

    assert refused.status_code == 404
    assert refused.json() == {"detail": "No such workspace."}
