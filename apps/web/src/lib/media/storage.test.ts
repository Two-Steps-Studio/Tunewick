import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { accountEndpoint, isMediaStorageConfigured } = await import("./storage");

describe("media storage config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("strips the bucket Cloudflare appends to the endpoint", () => {
    const account = "https://abc.r2.cloudflarestorage.com";
    expect(accountEndpoint(`${account}/tunewick-ingest/`, "tunewick-ingest")).toBe(account);
    expect(accountEndpoint(account, "tunewick-ingest")).toBe(account);
  });

  it("accepts Cloudflare's R2_* names as well as MEDIA_*", () => {
    for (const name of [
      "MEDIA_S3_ENDPOINT",
      "MEDIA_S3_ACCESS_KEY_ID",
      "MEDIA_S3_SECRET_ACCESS_KEY",
      "MEDIA_INGEST_BUCKET",
    ]) {
      vi.stubEnv(name, "");
    }
    expect(isMediaStorageConfigured()).toBe(false);
    vi.stubEnv("R2_ENDPOINT", "https://abc.r2.cloudflarestorage.com");
    vi.stubEnv("R2_ACCESS_KEY_ID", "id");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET_NAME", "tunewick-ingest");
    expect(isMediaStorageConfigured()).toBe(true);
  });
});
