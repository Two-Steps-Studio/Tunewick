import "server-only";

import { AwsClient } from "aws4fetch";

/**
 * S3-compatible object storage for masters: Cloudflare R2 in production, local SeaweedFS in
 * development and CI (pnpm media:start). Path-style URLs work with both. Server-only — the
 * browser only ever receives short-lived presigned URLs.
 */

interface MediaConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  ingestBucket: string;
  /** Delivery variants written by the audio worker. */
  mediaBucket: string | null;
}

/** The first non-empty variable of `names` (MEDIA_* first, then Cloudflare's usual R2_* names). */
function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Cloudflare shows the endpoint with the bucket appended; requests need the account endpoint. */
export function accountEndpoint(endpoint: string, bucket: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return base.endsWith(`/${bucket}`) ? base.slice(0, -bucket.length - 1) : base;
}

function config(): MediaConfig | null {
  const endpoint = env("MEDIA_S3_ENDPOINT", "R2_ENDPOINT");
  const accessKeyId = env("MEDIA_S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID");
  const secretAccessKey = env("MEDIA_S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY");
  const ingestBucket = env("MEDIA_INGEST_BUCKET", "R2_BUCKET_NAME");
  if (!endpoint || !accessKeyId || !secretAccessKey || !ingestBucket) return null;
  return {
    endpoint: accountEndpoint(endpoint, ingestBucket),
    region: env("MEDIA_S3_REGION", "R2_REGION") || "auto",
    accessKeyId,
    secretAccessKey,
    ingestBucket,
    mediaBucket: env("MEDIA_BUCKET", "R2_MEDIA_BUCKET") ?? null,
  };
}

export function isMediaStorageConfigured(): boolean {
  return config() !== null;
}

function client(cfg: MediaConfig) {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: cfg.region,
  });
}

function objectUrl(cfg: MediaConfig, key: string, bucket = cfg.ingestBucket) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${cfg.endpoint}/${bucket}/${path}`;
}

const UPLOAD_URL_TTL_S = 60 * 60; // large masters on slow connections

/** Presigned PUT into the ingest (quarantine) bucket — masters and original images. */
export async function presignIngestUpload(key: string): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("Media storage is not configured");
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_S));
  const signed = await client(cfg).sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Writes a server-made file into the ingest bucket (e.g. the card a share clip is made from). */
export async function putIngestObject(key: string, body: ArrayBuffer, contentType: string) {
  const cfg = config();
  if (!cfg) throw new Error("Media storage is not configured");
  const response = await client(cfg).fetch(objectUrl(cfg, key), {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!response.ok) throw new Error(`Storage PUT failed: ${response.status}`);
}

/** Size of an uploaded object in the ingest bucket, or null when it does not exist. */
export async function ingestObjectSize(key: string): Promise<number | null> {
  const cfg = config();
  if (!cfg) throw new Error("Media storage is not configured");
  const response = await client(cfg).fetch(objectUrl(cfg, key), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage HEAD failed: ${response.status}`);
  return Number(response.headers.get("content-length"));
}

const PREVIEW_URL_TTL_S = 2 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Short-lived GET URL for a delivery variant — members' preview of their own processed tracks.
 * Public playback will go through the media edge with playback tokens (docs/architecture.md §6.4).
 */
export async function presignVariantGet(
  key: string,
  /** Download under this file name instead of playing inline. */
  downloadName?: string,
): Promise<string | null> {
  const cfg = config();
  if (!cfg?.mediaBucket) return null;
  const url = new URL(objectUrl(cfg, key, cfg.mediaBucket));
  url.searchParams.set("X-Amz-Expires", String(PREVIEW_URL_TTL_S));
  if (downloadName) {
    url.searchParams.set("response-content-disposition", `attachment; filename="${downloadName}"`);
  }
  const signed = await client(cfg).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * GET URL for a processed image. Signed with the start of the current UTC day and valid for two
 * days, so the same URL is reused all day and browsers can cache the (immutable) file.
 */
export async function presignImageGet(key: string): Promise<string | null> {
  const cfg = config();
  if (!cfg?.mediaBucket) return null;
  const day = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
  const url = new URL(objectUrl(cfg, key, cfg.mediaBucket));
  url.searchParams.set("X-Amz-Expires", String(2 * 24 * 60 * 60));
  const signed = await client(cfg).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true, datetime: day.toISOString().replace(/[:-]|\.\d{3}/g, "") },
  });
  return signed.url;
}
