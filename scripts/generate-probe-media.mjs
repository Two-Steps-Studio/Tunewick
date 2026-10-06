// Tiny files the player uses to test what a browser really decodes (docs/audio.md §4: never trust
// canPlayType/isTypeSupported alone). Committed under apps/web/public/player-probe/.
// Run: node scripts/generate-probe-media.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

const out = join(import.meta.dirname, "..", "apps", "web", "public", "player-probe");
mkdirSync(out, { recursive: true });

const FMP4 = ["-movflags", "+empty_moov+default_base_moof", "-frag_duration", "200000"];
const tone = (rate) => ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=${rate}:duration=0.5`];
const run = (args) =>
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

run([
  ...tone(48000),
  "-ac",
  "2",
  "-c:a",
  "aac",
  "-b:a",
  "96k",
  ...FMP4,
  "-f",
  "mp4",
  join(out, "aac.mp4"),
]);
run([...tone(48000), "-ac", "2", "-sample_fmt", "s16", "-c:a", "flac", join(out, "flac-48.flac")]);
run([
  "-i",
  join(out, "flac-48.flac"),
  "-c",
  "copy",
  "-strict",
  "-2",
  ...FMP4,
  "-f",
  "mp4",
  join(out, "flac.mp4"),
]);
run([
  ...tone(96000),
  "-ac", "2", "-sample_fmt", "s32", "-bits_per_raw_sample", "24", "-c:a", "flac",
  join(out, "flac-96.flac"),
]); // prettier-ignore

for (const file of ["aac.mp4", "flac.mp4", "flac-48.flac", "flac-96.flac"]) {
  console.log(file, statSync(join(out, file)).size, "bytes");
}
