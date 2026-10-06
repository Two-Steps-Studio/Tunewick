// Generates synthetic test media for the playback spike (M3.0). No copyrighted material:
// a continuous stereo sine sweep at -12 dBFS, so any gap or silence is measurable.
// Output: tools/playback-spike/media/ (git-ignored). Run: node tools/playback-spike/generate.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "media");
mkdirSync(out, { recursive: true });

const DURATION = 12; // seconds (3 album tracks × 4 s)
const F0 = 100;
const F1 = 15000;
// Linear chirp: phase = 2π (f0 t + k t² / 2), k = (f1 - f0) / T
const sweep = `0.25*sin(2*PI*(${F0}*t+${(F1 - F0) / (2 * DURATION)}*t*t))`;

function run(args) {
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function source(rate) {
  return ["-f", "lavfi", "-i", `aevalsrc='${sweep}|${sweep}':s=${rate}:d=${DURATION}`];
}

const FRAG = ["-movflags", "+frag_keyframe+empty_moov+default_base_moof"];
const files = [];

// 1) Single files at the resolutions the tiers may deliver.
const variants = [
  { id: "flac-16-44", rate: 44100, fmt: ["-sample_fmt", "s16"] },
  { id: "flac-24-48", rate: 48000, fmt: ["-sample_fmt", "s32", "-bits_per_raw_sample", "24"] },
  { id: "flac-24-96", rate: 96000, fmt: ["-sample_fmt", "s32", "-bits_per_raw_sample", "24"] },
  { id: "flac-24-192", rate: 192000, fmt: ["-sample_fmt", "s32", "-bits_per_raw_sample", "24"] },
];
for (const v of variants) {
  const flac = `${v.id}.flac`;
  run([...source(v.rate), ...v.fmt, "-c:a", "flac", join(out, flac)]);
  files.push({ id: v.id, file: flac, container: "flac", codec: "flac", rate: v.rate });

  const mp4 = `${v.id}.mp4`;
  run([
    ...source(v.rate),
    ...v.fmt,
    "-c:a",
    "flac",
    "-strict",
    "-2",
    ...FRAG,
    "-f",
    "mp4",
    join(out, mp4),
  ]);
  files.push({ id: `${v.id}-fmp4`, file: mp4, container: "fmp4", codec: "flac", rate: v.rate });
}

run([
  ...source(48000),
  "-c:a",
  "aac",
  "-b:a",
  "256k",
  ...FRAG,
  "-f",
  "mp4",
  join(out, "aac-256-48.m4a"),
]);
files.push({
  id: "aac-256-48-fmp4",
  file: "aac-256-48.m4a",
  container: "fmp4",
  codec: "aac",
  rate: 48000,
});

// 2) Gapless "album": one continuous sweep cut into 3 tracks at exact sample boundaries.
const albumRate = 48000;
const trackSamples = 4 * albumRate;
const album = [];
for (let i = 0; i < 3; i++) {
  const trim = `atrim=start_sample=${i * trackSamples}:end_sample=${(i + 1) * trackSamples},asetpts=PTS-STARTPTS`;
  const base = [...source(albumRate), "-af", trim];
  const flac = `album-${i + 1}.flac`;
  const flacMp4 = `album-${i + 1}.mp4`;
  const aac = `album-${i + 1}.m4a`;
  run([
    ...base,
    "-sample_fmt",
    "s32",
    "-bits_per_raw_sample",
    "24",
    "-c:a",
    "flac",
    join(out, flac),
  ]);
  run([
    ...base,
    "-sample_fmt",
    "s32",
    "-bits_per_raw_sample",
    "24",
    "-c:a",
    "flac",
    "-strict",
    "-2",
    ...FRAG,
    "-f",
    "mp4",
    join(out, flacMp4),
  ]);
  run([...base, "-c:a", "aac", "-b:a", "256k", ...FRAG, "-f", "mp4", join(out, aac)]);
  album.push({ track: i + 1, flac, flacMp4, aac, seconds: 4 });
}

const manifest = {
  generated: new Date().toISOString(),
  ffmpeg: execFileSync(ffmpeg, ["-version"], { encoding: "utf8" }).split("\n")[0],
  signal: `stereo linear sweep ${F0}–${F1} Hz, -12 dBFS, ${DURATION} s`,
  files: files.map((f) => ({ ...f, bytes: statSync(join(out, f.file)).size })),
  album,
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Generated ${files.length} files + ${album.length} album tracks in ${out}`);
