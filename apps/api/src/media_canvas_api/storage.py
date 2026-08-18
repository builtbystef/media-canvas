"""The object storage the api holds bytes in.

Two buckets: assets are written once and kept, outputs belong to a Generation
Job and are deleted with it. Keeping them apart makes it structurally
impossible for a job's prefix delete to reach an asset.

Bytes reach a client only through `serve` — the api streams them itself, and
never hands out a storage URL, a credential, or a signed link.
"""

from collections.abc import Iterator
from dataclasses import dataclass

import boto3
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

from media_canvas_api.settings import Settings

# What one read takes off the wire before it is handed on. Large enough that a
# render output is a handful of reads, small enough that no single object is
# ever held in memory whole.
CHUNK_SIZE = 64 * 1024

# What the store answers a repeat CreateBucket with: this one already exists,
# which is the outcome the call wanted. S3 answers the second name outside
# us-east-1, and Garage answers the first.
ALREADY_THERE = ("BucketAlreadyOwnedByYou", "BucketAlreadyExists")

# The one refusal that is an answer rather than a fault: no such key. A missing
# bucket, a bad credential or a store that is down all still raise.
MISSING = "NoSuchKey"


@dataclass(frozen=True)
class StoredObject:
    """One object's bytes, still on the wire, and what they are."""

    content_type: str
    size: int
    body: StreamingBody

    def read(self) -> bytes:
        return self.body.read()

    def chunks(self) -> Iterator[bytes]:
        return self.body.iter_chunks(CHUNK_SIZE)


@dataclass(frozen=True)
class Bucket:
    """One bucket, and everything the product does to it."""

    client: BaseClient
    name: str

    def ensure(self) -> None:
        """Create the bucket, or accept that it is already there."""
        try:
            self.client.create_bucket(Bucket=self.name)
        except ClientError as refused:
            if _code(refused) not in ALREADY_THERE:
                raise

    def put(self, key: str, body: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.name, Key=key, Body=body, ContentType=content_type
        )

    def open(self, key: str) -> StoredObject | None:
        """The object under `key`, or None when the store holds no such key."""
        try:
            answer = self.client.get_object(Bucket=self.name, Key=key)
        except ClientError as refused:
            if _code(refused) == MISSING:
                return None
            raise
        return StoredObject(
            content_type=answer["ContentType"],
            size=answer["ContentLength"],
            body=answer["Body"],
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.name, Key=key)

    def delete_prefix(self, prefix: str) -> None:
        """Delete every key under `prefix`, including none at all."""
        pages = self.client.get_paginator("list_objects_v2").paginate(
            Bucket=self.name, Prefix=prefix
        )
        for page in pages:
            keys = [{"Key": stored["Key"]} for stored in page.get("Contents", ())]
            if keys:
                self.client.delete_objects(Bucket=self.name, Delete={"Objects": keys})


class ObjectStore:
    """The api's connection to object storage, and the buckets it owns."""

    def __init__(self, settings: Settings) -> None:
        client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint,
            region_name=settings.storage_region,
            aws_access_key_id=settings.storage_access_key,
            aws_secret_access_key=settings.storage_secret_key,
        )
        self.assets = Bucket(client, settings.assets_bucket)
        self.outputs = Bucket(client, settings.outputs_bucket)

    def ensure_buckets(self) -> None:
        """Make every bucket the product needs exist. Safe to run again."""
        for bucket in (self.assets, self.outputs):
            bucket.ensure()


def serve(bucket: Bucket, key: str) -> StreamingResponse:
    """Hand stored bytes to a client, a chunk at a time.

    The one path from storage to a response: nothing else may read an object
    and build the response itself, so every served byte leaves by this door.
    """
    stored = bucket.open(key)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such file.")
    return StreamingResponse(
        stored.chunks(),
        media_type=stored.content_type,
        headers={"content-length": str(stored.size)},
    )


def _code(refused: ClientError) -> str:
    return str(refused.response.get("Error", {}).get("Code", ""))
