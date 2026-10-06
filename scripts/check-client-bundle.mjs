// Fails if anything that looks like a server secret ends up in the browser bundle
// (docs/security.md §3). Run after `pnpm build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "apps/web/.next/static";
const patterns = [
  /service_role/i, // legacy Supabase service-role JWT role claim
  /sb_secret_[A-Za-z0-9_-]{8,}/, // Supabase secret API keys
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SUPABASE_SECRET_KEY/,
  /MEDIA_S3_SECRET_ACCESS_KEY/,
  /tunewick-local-secret/, // local S3 secret (docker/media) must stay server-side too
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// Exact secret values, when provided to the check (e.g. in CI from the local Supabase).
for (const name of [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MEDIA_S3_SECRET_ACCESS_KEY",
]) {
  const value = process.env[name];
  if (value && value.length > 16)
    patterns.push(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|json|html|css|map)$/.test(entry)) yield path;
  }
}

let checked = 0;
const findings = [];
for (const file of files(root)) {
  checked++;
  const content = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.test(content)) findings.push(`${file}: matches ${pattern.source.slice(0, 40)}`);
  }
}

if (checked === 0) {
  console.error(`No client files found in ${root}. Run \`pnpm build\` first.`);
  process.exit(1);
}
if (findings.length > 0) {
  console.error("Possible server secrets in the client bundle:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Client bundle clean (${checked} files checked).`);
