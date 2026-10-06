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

function objectUrl(cfg: MediaConfig, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${cfg.endpoint}/${cfg.ingestBucket}/${path}`;
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
