// Starts local S3-compatible storage (docker/media) and creates the buckets, then rewrites
// apps/web/.env.local (pnpm db:env) so the app picks up the local storage settings.
// Local-only credentials from docker/media/s3.json — never used anywhere else.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";

export const LOCAL_MEDIA = {
  endpoint: "http://127.0.0.1:8333",
  region: "auto",
  accessKeyId: "tunewick-local",
  secretAccessKey: "tunewick-local-secret-not-for-production",
  ingestBucket: "tunewick-ingest",
  mediaBucket: "tunewick-media",
};

const root = join(import.meta.dirname, "..");

async function waitForS3(client) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await client.fetch(`${LOCAL_MEDIA.endpoint}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Local S3 did not start (docker/media)");
}

if (process.argv[1] === import.meta.filename) {
  execFileSync(
    "docker",
    ["compose", "-f", join(root, "docker", "media", "compose.yml"), "up", "-d"],
    {
      stdio: "inherit",
    },
  );
  const client = new AwsClient({
    accessKeyId: LOCAL_MEDIA.accessKeyId,
    secretAccessKey: LOCAL_MEDIA.secretAccessKey,
    service: "s3",
    region: LOCAL_MEDIA.region,
  });
  await waitForS3(client);
  for (const bucket of [LOCAL_MEDIA.ingestBucket, LOCAL_MEDIA.mediaBucket]) {
    const response = await client.fetch(`${LOCAL_MEDIA.endpoint}/${bucket}`, { method: "PUT" });
    // 409 = already exists (BucketAlreadyOwnedByYou)
    if (!response.ok && response.status !== 409) {
      throw new Error(
        `Creating bucket ${bucket} failed: ${response.status} ${await response.text()}`,
      );
    }
  }
  console.log(`Local S3 ready at ${LOCAL_MEDIA.endpoint} (buckets: ingest, media)`);
}
