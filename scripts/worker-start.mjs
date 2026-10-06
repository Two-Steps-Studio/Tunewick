// Runs the audio worker locally in Docker against local Supabase (pnpm db:start) and local S3
// (pnpm media:start), polling the queue every second. Logs: docker logs -f tunewick-audio-worker-dev
import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";
import { LOCAL_MEDIA } from "./media-start.mjs";

const root = join(import.meta.dirname, "..");
const image = "tunewick-audio-worker";
const name = "tunewick-audio-worker-dev";

const status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
const read = (key) => status.match(new RegExp(`^${key}="?(.*?)"?$`, "m"))?.[1];
const apiUrl = read("API_URL");
const secret = read("SECRET_KEY");
if (!apiUrl || !secret) throw new Error("Local Supabase is not running (pnpm db:start)");

// Linux (CI): share the host network. Docker Desktop: reach the host via host.docker.internal.
const linux = process.platform === "linux";
const host = (url) => (linux ? url : url.replace("127.0.0.1", "host.docker.internal"));
const network = linux ? ["--network", "host"] : ["--add-host", "host.docker.internal:host-gateway"];

execFileSync("docker", ["build", "-q", "-t", image, join(root, "services", "audio-worker")], {
  stdio: "inherit",
});
try {
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
} catch {}

const env = {
  TUNEWICK_SUPABASE_URL: host(apiUrl),
  TUNEWICK_SUPABASE_SECRET_KEY: secret,
  MEDIA_S3_ENDPOINT: host(LOCAL_MEDIA.endpoint),
  MEDIA_S3_REGION: LOCAL_MEDIA.region,
  MEDIA_S3_ACCESS_KEY_ID: LOCAL_MEDIA.accessKeyId,
  MEDIA_S3_SECRET_ACCESS_KEY: LOCAL_MEDIA.secretAccessKey,
  MEDIA_INGEST_BUCKET: LOCAL_MEDIA.ingestBucket,
  MEDIA_BUCKET: LOCAL_MEDIA.mediaBucket,
};
execFileSync(
  "docker",
  [
    "run",
    "-d",
    "--name",
    name,
    ...network,
    ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    image,
    "worker",
    "--poll",
    "1",
  ],
  { stdio: "inherit" },
);
console.log(`Audio worker running (${name}). Logs: docker logs -f ${name}`);
