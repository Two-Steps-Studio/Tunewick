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

function config(): MediaConfig | null {
  const endpoint = process.env.MEDIA_S3_ENDPOINT;
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
  const ingestBucket = process.env.MEDIA_INGEST_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !ingestBucket) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: process.env.MEDIA_S3_REGION || "auto",
    accessKeyId,
    secretAccessKey,
    ingestBucket,
    mediaBucket: process.env.MEDIA_BUCKET || null,
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

/** Presigned PUT for a master in the ingest bucket. */
export async function presignMasterUpload(key: string): Promise<string> {
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

/** Size of an uploaded master, or null when the object does not exist. */
export async function masterSize(key: string): Promise<number | null> {
  const cfg = config();
  if (!cfg) throw new Error("Media storage is not configured");
  const response = await client(cfg).fetch(objectUrl(cfg, key), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage HEAD failed: ${response.status}`);
  return Number(response.headers.get("content-length"));
}

const PREVIEW_URL_TTL_S = 2 * 60 * 60;

/**
 * Short-lived GET URL for a delivery variant — members' preview of their own processed tracks.
 * Public playback will go through the media edge with playback tokens (docs/architecture.md §6.4).
 */
export async function presignVariantGet(key: string): Promise<string | null> {
  const cfg = config();
  if (!cfg?.mediaBucket) return null;
  const url = new URL(objectUrl(cfg, key, cfg.mediaBucket));
  url.searchParams.set("X-Amz-Expires", String(PREVIEW_URL_TTL_S));
  const signed = await client(cfg).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}
