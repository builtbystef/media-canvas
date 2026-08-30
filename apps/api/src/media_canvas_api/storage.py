"""The object storage the api holds bytes in.

Two buckets: assets are written once and kept, outputs belong to a Generation
Job and are deleted with it. Keeping them apart makes it structurally
impossible for a job's prefix delete to reach an asset.

Bytes reach a client only through `serve` — the api streams them itself, and
never hands out a storage URL, a credential, or a signed link.
"""

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from zipfile import ZIP_STORED, ZipFile, ZipInfo

import boto3
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

from media_canvas_api.settings import Settings

CHUNK_SIZE = 64 * 1024

ALREADY_THERE = ("BucketAlreadyOwnedByYou", "BucketAlreadyExists")

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


def serve(bucket: Bucket, key: str, media_type: str | None = None) -> StreamingResponse:
    """Hand stored bytes to a client, a chunk at a time.

    The one path from storage to a response: nothing else may read an object
    and build the response itself, so every served byte leaves by this door.
    `media_type` is what the product says the bytes are — a Job's output
    format, an asset's stored type — and the store's own type is only the
    fallback when the caller has nothing better.
    """
    stored = bucket.open(key)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such file.")
    return StreamingResponse(
        stored.chunks(),
        media_type=media_type or stored.content_type,
        headers={"content-length": str(stored.size)},
    )


def serve_archive(
    bucket: Bucket, entries: Iterable[tuple[str, str]]
) -> StreamingResponse:
    """A zip of stored objects, streamed as it is written.

    Each pair is the name the archive should carry and the key the bytes
    live under. The zip is never held whole: each object's chunks go into
    the archive and out to the client before the next object is opened.
    """
    return StreamingResponse(archived(bucket, entries), media_type="application/zip")


def archived(bucket: Bucket, entries: Iterable[tuple[str, str]]) -> Iterator[bytes]:
    """Yield a zip, a written chunk at a time, rather than assembling it."""
    sink = _Sink()
    with ZipFile(sink, mode="w", compression=ZIP_STORED) as zipped:
        for name, key in entries:
            stored = bucket.open(key)
            if stored is None:
                continue
            with zipped.open(ZipInfo(name), mode="w") as dest:
                for chunk in stored.chunks():
                    dest.write(chunk)
                    flushed = sink.take()
                    if flushed:
                        yield flushed
    leftover = sink.take()
    if leftover:
        yield leftover


class _Sink:
    """A write-only buffer ZipFile can flush into between objects."""

    def __init__(self) -> None:
        self.pending = bytearray()

    def write(self, data: bytes) -> int:
        self.pending.extend(data)
        return len(data)

    def flush(self) -> None:
        return

    def close(self) -> None:
        return

    def take(self) -> bytes:
        chunk = bytes(self.pending)
        del self.pending[:]
        return chunk


def _code(refused: ClientError) -> str:
    return str(refused.response.get("Error", {}).get("Code", ""))
