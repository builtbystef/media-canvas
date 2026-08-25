// Where a finished Row's bytes go: the worker writes them itself, under the
// Job's prefix, and then reports the key. The api never sees the bytes on
// this path — it will later serve them by reading the same key.

import { createHash, createHmac } from "node:crypto";

import { InternalServiceConfigError } from "./internal-service.ts";

/** One place that can hold a rendered file. Tests stand this in; production
 *  talks to the outputs bucket over S3. */
export type OutputStore = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
};

export type OutputStoreConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

const DEFAULT_ENDPOINT = "http://localhost:3900";
const DEFAULT_REGION = "garage";
const DEFAULT_BUCKET = "media-canvas-outputs";

/**
 * The outputs bucket and the credential that writes to it. The pair is the
 * same one Garage (and the api) already read: one credential, set once.
 */
export function outputStoreConfig(env: Record<string, string | undefined>): OutputStoreConfig {
  const accessKey = env.GARAGE_DEFAULT_ACCESS_KEY;
  if (accessKey === undefined || accessKey === "") {
    throw new InternalServiceConfigError(
      "GARAGE_DEFAULT_ACCESS_KEY: the object-storage credential is required. " +
        "Copy .env.example to .env and fill in the values it marks required.",
    );
  }
  const secretKey = env.GARAGE_DEFAULT_SECRET_KEY;
  if (secretKey === undefined || secretKey === "") {
    throw new InternalServiceConfigError(
      "GARAGE_DEFAULT_SECRET_KEY: the object-storage credential is required. " +
        "Copy .env.example to .env and fill in the values it marks required.",
    );
  }
  const endpoint = emptyToDefault(env.STORAGE_ENDPOINT, DEFAULT_ENDPOINT).replace(/\/$/, "");
  try {
    new URL(endpoint);
  } catch {
    throw new InternalServiceConfigError(`STORAGE_ENDPOINT: "${endpoint}" is not a URL.`);
  }
  return {
    endpoint,
    region: emptyToDefault(env.STORAGE_REGION, DEFAULT_REGION),
    bucket: emptyToDefault(env.OUTPUTS_BUCKET, DEFAULT_BUCKET),
    accessKey,
    secretKey,
  };
}

/** PutObject against an S3-compatible store, path-style, SigV4. */
export function createS3OutputStore(config: OutputStoreConfig): OutputStore {
  return {
    async put(key, body, contentType) {
      const url = new URL(`${config.endpoint}/${config.bucket}/${encodeKey(key)}`);
      const now = new Date();
      const amzDate = compactDate(now);
      const dateStamp = amzDate.slice(0, 8);
      const payloadHash = sha256Hex(body);
      const headers: Record<string, string> = {
        "content-type": contentType,
        host: url.host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      };
      headers.authorization = sign(config, url, headers, payloadHash, amzDate, dateStamp);
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": amzDate,
          authorization: headers.authorization,
        },
        body: Buffer.from(body),
      });
      if (!response.ok) {
        throw new Error(
          `object storage refused PutObject: HTTP ${String(response.status)} ${await response.text()}`,
        );
      }
    },
  };
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function emptyToDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

function compactDate(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sign(
  config: OutputStoreConfig,
  url: URL,
  headers: Record<string, string>,
  payloadHash: string,
  amzDate: string,
  dateStamp: string,
): string {
  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((name) => `${name}:${headers[name] ?? ""}\n`).join("");
  const signedHeaders = signedNames.join(";");
  const canonical = ["PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join(
    "\n",
  );
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretKey}`, dateStamp), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return (
    `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}
