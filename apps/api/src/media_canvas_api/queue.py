"""The work signal: one BullMQ task per Row, identifiers only (ADR-0004).

Postgres holds Job and Row state; Redis holds the wake-up. The payload is
the pair of ids and nothing else — values, the snapshot and the format stay
in the database, and the worker fetches them over the internal calls.

Tasks are written in BullMQ's Redis layout so the Node consumer can pop
them: a hash under bull:rows:{id}, that id on the wait list, a marker in
the zset, and attempts: 2 on the job options.
"""

from __future__ import annotations

import json
from asyncio import (
    Lock,
    StreamReader,
    StreamWriter,
    open_connection,
    open_unix_connection,
)
from collections.abc import Sequence
from time import time
from uuid import UUID

from media_canvas_api.settings import Settings

# The name the Node worker will consume. Changing it is a cross-runtime break.
QUEUE_NAME = "rows"
JOB_NAME = "row"
PREFIX = f"bull:{QUEUE_NAME}"

# One automatic retry on a transient error: BullMQ's attempts counts the
# original try, so 2 is the contract's single retry.
ATTEMPTS = 2


class QueueUnreachable(RuntimeError):
    """Redis did not answer. Nothing the caller did causes this."""


class RowQueue:
    """Produces per-Row BullMQ tasks against the compose stack's Redis."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = Lock()
        self._reader: StreamReader | None = None
        self._writer: StreamWriter | None = None

    async def enqueue(self, tasks: Sequence[tuple[UUID, UUID]]) -> None:
        """One waiting task per pair, payload `{jobId, rowId}` only."""
        timestamp = str(round(time() * 1000))
        opts = json.dumps({"attempts": ATTEMPTS, "delay": 0}, separators=(",", ":"))
        for job_id, row_id in tasks:
            data = json.dumps(
                {"jobId": str(job_id), "rowId": str(row_id)}, separators=(",", ":")
            )
            await self._add(data, opts, timestamp)

    async def aclose(self) -> None:
        async with self._lock:
            await self._disconnect()

    async def _add(self, data: str, opts: str, timestamp: str) -> None:
        # One Lua script per Row so the id, the hash, the wait list and the
        # marker land together — a crash between them would leave a hash the
        # worker could never pop.
        added = await self._eval(
            _ADD_JOB,
            0,
            PREFIX,
            JOB_NAME,
            data,
            opts,
            timestamp,
        )
        if not isinstance(added, bytes | str | int):
            raise QueueUnreachable("Redis did not accept a Row task")

    async def _eval(self, script: str, num_keys: int, *args: str) -> object:
        return await self._command("EVAL", script, str(num_keys), *args)

    async def _command(self, *parts: str) -> object:
        async with self._lock:
            try:
                await self._ensure()
                assert self._writer is not None
                assert self._reader is not None
                self._writer.write(_encode(*parts))
                await self._writer.drain()
                return await _read(self._reader)
            except (OSError, QueueUnreachable) as silent:
                await self._disconnect()
                raise QueueUnreachable(
                    "Redis is not reachable. The tests and the api run "
                    "against the compose stack's Redis: `docker compose up -d`."
                ) from silent

    async def _ensure(self) -> None:
        if self._writer is not None:
            return
        settings = self._settings
        try:
            if settings.redis_host.startswith("/"):
                self._reader, self._writer = await open_unix_connection(
                    settings.redis_host
                )
            else:
                self._reader, self._writer = await open_connection(
                    settings.redis_host, settings.redis_port
                )
        except OSError as silent:
            raise QueueUnreachable("Redis is not reachable") from silent
        if settings.redis_db:
            self._writer.write(_encode("SELECT", str(settings.redis_db)))
            await self._writer.drain()
            await _read(self._reader)

    async def _disconnect(self) -> None:
        writer = self._writer
        self._reader = None
        self._writer = None
        if writer is not None:
            writer.close()
            await writer.wait_closed()


# Mirrors BullMQ's addStandardJob for a FIFO Row: INCR the id, HMSET the
# hash, LPUSH wait, ZADD the marker so a blocking worker wakes, and emit
# the added/waiting events the Node client expects on the stream.
_ADD_JOB = """
local prefix = ARGV[1]
local name = ARGV[2]
local data = ARGV[3]
local opts = ARGV[4]
local timestamp = ARGV[5]
local jobId = tostring(redis.call("INCR", prefix .. ":id"))
local jobKey = prefix .. ":" .. jobId
redis.call("HMSET", jobKey, "name", name, "data", data, "opts", opts,
           "timestamp", timestamp, "delay", "0", "priority", "0")
redis.call("LPUSH", prefix .. ":wait", jobId)
redis.call("ZADD", prefix .. ":marker", 0, "0")
redis.call("HSETNX", prefix .. ":meta", "opts.maxLenEvents", "10000")
redis.call("XADD", prefix .. ":events", "*", "event", "added",
           "jobId", jobId, "name", name)
redis.call("XADD", prefix .. ":events", "*", "event", "waiting",
           "jobId", jobId)
return jobId
"""


def _encode(*parts: str) -> bytes:
    payload = f"*{len(parts)}\r\n".encode()
    for part in parts:
        encoded = part.encode()
        payload += f"${len(encoded)}\r\n".encode() + encoded + b"\r\n"
    return payload


async def _read(reader: StreamReader) -> object:
    prefix = await reader.readexactly(1)
    if prefix == b"+":
        return await _line(reader)
    if prefix == b"-":
        raise QueueUnreachable((await _line(reader)).decode())
    if prefix == b":":
        return int(await _line(reader))
    if prefix == b"$":
        length = int(await _line(reader))
        if length == -1:
            return None
        data = await reader.readexactly(length)
        await reader.readexactly(2)
        return data
    if prefix == b"*":
        count = int(await _line(reader))
        if count == -1:
            return None
        return [await _read(reader) for _ in range(count)]
    raise QueueUnreachable(f"unexpected RESP type {prefix!r}")


async def _line(reader: StreamReader) -> bytes:
    line: bytes = await reader.readline()
    if not line.endswith(b"\r\n"):
        raise QueueUnreachable("Redis closed the connection")
    return line[:-2]
