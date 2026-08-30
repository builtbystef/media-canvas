import { createConnection, type Socket } from "node:net";

import { InternalServiceConfigError } from "./internal-service.ts";

export type RedisConnection = {
  host: string;
  port: number;
  db: number;
  path?: string;
};

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 6379;

export function redisConnection(env: Record<string, string | undefined>): RedisConnection {
  const host = emptyToDefault(env.REDIS_HOST, DEFAULT_HOST);
  const port = numberOr(env.REDIS_PORT, DEFAULT_PORT, "REDIS_PORT");
  const db = numberOr(env.REDIS_DB, 0, "REDIS_DB");
  return host.startsWith("/") ? { host, port, db, path: host } : { host, port, db };
}

export type RedisClient = {
  send(...args: string[]): Promise<unknown>;
  close(): Promise<void>;
};

export async function connectRedis(connection: RedisConnection): Promise<RedisClient> {
  const socket = await open(connection);
  const client = attach(socket);
  if (connection.db !== 0) await client.send("SELECT", String(connection.db));
  return client;
}

function open(connection: RedisConnection): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      connection.path === undefined
        ? createConnection({ host: connection.host, port: connection.port })
        : createConnection({ path: connection.path });
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", fail);
    socket.once("connect", () => {
      socket.off("error", fail);
      resolve(socket);
    });
  });
}

function attach(socket: Socket): RedisClient {
  let pending: { resolve: (value: unknown) => void; reject: (error: Error) => void } | undefined;
  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (pending === undefined) return;
    const parsed = read(buffer);
    if (parsed === undefined) return;
    buffer = Buffer.from(parsed.rest);
    const settle = pending;
    pending = undefined;
    if (parsed.ok) settle.resolve(parsed.value);
    else settle.reject(parsed.error);
  });

  socket.on("error", (error: Error) => {
    pending?.reject(error);
    pending = undefined;
  });

  socket.on("close", () => {
    pending?.reject(new Error("Redis closed the connection"));
    pending = undefined;
  });

  return {
    send(...args) {
      if (pending !== undefined) return Promise.reject(new Error("Redis is already waiting"));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        socket.write(encode(args));
      });
    },
    close() {
      return new Promise((resolve) => {
        socket.end(() => resolve());
      });
    },
  };
}

function encode(parts: string[]): Buffer {
  let payload = `*${String(parts.length)}\r\n`;
  for (const part of parts) {
    payload += `$${String(Buffer.byteLength(part))}\r\n${part}\r\n`;
  }
  return Buffer.from(payload);
}

type Parsed =
  | { ok: true; value: unknown; rest: Buffer }
  | { ok: false; error: Error; rest: Buffer };

function read(buffer: Buffer): Parsed | undefined {
  if (buffer.length === 0) return undefined;
  const kind = String.fromCharCode(buffer[0] ?? 0);
  if (kind === "+" || kind === "-" || kind === ":") {
    const line = readLine(buffer.subarray(1));
    if (line === undefined) return undefined;
    if (kind === "+") return { ok: true, value: line.value, rest: line.rest };
    if (kind === "-") return { ok: false, error: new Error(line.value), rest: line.rest };
    return { ok: true, value: Number(line.value), rest: line.rest };
  }
  if (kind === "$") {
    const header = readLine(buffer.subarray(1));
    if (header === undefined) return undefined;
    const length = Number(header.value);
    if (length === -1) return { ok: true, value: null, rest: header.rest };
    if (header.rest.length < length + 2) return undefined;
    const value = header.rest.subarray(0, length).toString("utf8");
    return { ok: true, value, rest: header.rest.subarray(length + 2) };
  }
  if (kind === "*") {
    const header = readLine(buffer.subarray(1));
    if (header === undefined) return undefined;
    const count = Number(header.value);
    if (count === -1) return { ok: true, value: null, rest: header.rest };
    let rest = header.rest;
    const items: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const item = read(rest);
      if (item === undefined) return undefined;
      if (!item.ok) return item;
      items.push(item.value);
      rest = item.rest;
    }
    return { ok: true, value: items, rest };
  }
  return { ok: false, error: new Error(`unexpected RESP type ${kind}`), rest: Buffer.alloc(0) };
}

function readLine(buffer: Buffer): { value: string; rest: Buffer } | undefined {
  const at = buffer.indexOf("\r\n");
  if (at < 0) return undefined;
  return { value: buffer.subarray(0, at).toString("utf8"), rest: buffer.subarray(at + 2) };
}

function emptyToDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

function numberOr(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InternalServiceConfigError(`${name}: "${value}" is not a non-negative integer.`);
  }
  return parsed;
}
