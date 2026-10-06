// Dev/test album for the player (M4.1): one continuous sine sweep cut into three 10 s masters at
// exact sample boundaries (24/96 FLAC), each processed by the real audio worker in Docker. Any gap
// or click at a track boundary is audible and measurable. Synthetic signal — no copyrighted audio.
// Output: apps/web/public/dev-media/album/<n>/ (git-ignored). Run: pnpm dev:media
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "apps", "web", "public", "dev-media");
const image = "tunewick-audio-worker";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

run("docker", ["build", "-q", "-t", image, join(root, "services", "audio-worker")]);

const RATE = 96000;
const TRACK_SECONDS = 10;
const TRACKS = 3;
const total = TRACK_SECONDS * TRACKS;
// Linear sweep 100 Hz → 40 kHz at −12 dBFS: full-band enough that the worker verifies it as
// genuine Hi-Res (no brick-wall cliff below 40 kHz).
const k = (40000 - 100) / (2 * total);
const sweep = `0.25*sin(2*PI*(100*t+${k}*t*t))`;
const samples = RATE * TRACK_SECONDS;

// The sweep alone is band-limited per track (track 1 never goes above ~13 kHz), which the worker
// rightly flags as a possible lossy origin, so a quiet continuous pink-noise bed (−40 dB) is mixed
// in. The full 30 s master is rendered once and then cut, so both signals are continuous across
// the track boundaries.
const noise = `anoisesrc=color=pink:amplitude=0.02:seed=3:sample_rate=${RATE}:duration=${total}`;
const steps = [
  `ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc='${sweep}|${sweep}':s=${RATE}:d=${total}" ` +
    `-f lavfi -i "${noise}" -filter_complex "[1]pan=stereo|c0=c0|c1=c0[n];[0][n]amix=inputs=2:normalize=0" ` +
    `-sample_fmt s32 -bits_per_raw_sample 24 -c:a flac /tmp/full.flac`,
];
for (let i = 0; i < TRACKS; i++) {
  const n = i + 1;
  const trim = `atrim=start_sample=${i * samples}:end_sample=${n * samples},asetpts=PTS-STARTPTS`;
  steps.push(
    `ffmpeg -hide_banner -loglevel error -y -i /tmp/full.flac -af "${trim}" ` +
      `-sample_fmt s32 -bits_per_raw_sample 24 -c:a flac /tmp/master-${n}.flac`,
    `mkdir -p /out/album/${n}`,
    `python -m tunewick_audio process /tmp/master-${n}.flac --out /out/album/${n} --report /out/album/${n}/report.json`,
  );
}

const user = process.getuid ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];
run("docker", [
  "run",
  "--rm",
  ...user,
  "-v",
  `${out}:/out`,
  "--entrypoint",
  "sh",
  image,
  "-c",
  steps.join(" && "),
]);
console.log(`Dev album ready in ${out}`);
