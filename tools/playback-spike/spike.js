// Playback spike (M3.0): measures what browsers really do with FLAC, Hi-Res and fMP4/MSE.
// Every playback test checks the *signal* through an AnalyserNode, not just currentTime, because
// a known WebKit failure mode is "plays without error but outputs silence".

const status = document.getElementById("status");
const out = document.getElementById("out");
const json = document.getElementById("json");
const results = { env: {}, capabilities: [], progressive: [], mse: [], gapless: {} };
window.__results = null;

const MIME = {
  flac: "audio/flac",
  "fmp4-flac": 'audio/mp4; codecs="flac"',
  "fmp4-aac": 'audio/mp4; codecs="mp4a.40.2"',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ctx;

function analyserFor(audio, fftSize = 2048) {
  // Some engines (e.g. Playwright WebKit on Windows) have no Web Audio: signal not measurable.
  if (!ctx) return () => null;
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  const silent = ctx.createGain();
  silent.gain.value = 0; // measured, never heard
  source.connect(analyser).connect(silent).connect(ctx.destination);
  const buf = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  };
}

async function measurePlayback(audio, ms = 1200) {
  const rms = analyserFor(audio);
  const t0 = audio.currentTime;
  let peak = null;
  let error = null;
  try {
    await audio.play();
  } catch (e) {
    error = String(e?.name ?? e);
  }
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const level = rms();
    if (level !== null) peak = Math.max(peak ?? 0, level);
    await sleep(20);
  }
  const advanced = audio.currentTime - t0;
  audio.pause();
  return {
    error: error ?? (audio.error ? `MediaError ${audio.error.code}` : null),
    advancedSeconds: Number(advanced.toFixed(3)),
    peakRms: peak === null ? null : Number(peak.toFixed(4)),
    // Signal is a -12 dBFS sine (RMS ≈ 0.177); near zero means silent output.
    // null = not measurable in this engine (no Web Audio); then only time advance is known.
    audible: peak === null ? (advanced > 0.5 ? "unmeasured (time advances)" : false) : peak > 0.05,
  };
}

function waitFor(target, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function fetchBuffer(file) {
  const res = await fetch(`media/${file}`);
  return res.arrayBuffer();
}

function newMediaSource() {
  const Managed = window.ManagedMediaSource;
  if (Managed) return { ms: new Managed(), managed: true };
  if (window.MediaSource) return { ms: new MediaSource(), managed: false };
  return null;
}

async function mseAudio(mime, buffers, { sequence = false } = {}) {
  const created = newMediaSource();
  if (!created) throw new Error("no MediaSource");
  const { ms, managed } = created;
  const audio = new Audio();
  audio.disableRemotePlayback = true; // required for ManagedMediaSource on iOS
  audio.src = URL.createObjectURL(ms);
  await waitFor(ms, "sourceopen");
  const sb = ms.addSourceBuffer(mime);
  if (sequence) sb.mode = "sequence";
  for (const b of buffers) {
    sb.appendBuffer(b);
    await waitFor(sb, "updateend", 10000);
  }
  ms.endOfStream();
  const ranges = [];
  for (let i = 0; i < sb.buffered.length; i++) {
    ranges.push([Number(sb.buffered.start(i).toFixed(4)), Number(sb.buffered.end(i).toFixed(4))]);
  }
  return { audio, managed, ranges };
}

function table(title, rows, columns) {
  const h = document.createElement("h2");
  h.textContent = title;
  const t = document.createElement("table");
  t.innerHTML =
    `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>` +
    rows
      .map(
        (r) =>
          `<tr>${columns
            .map((c) => {
              const v = r[c];
              const cls = v === true ? "ok" : v === false ? "fail" : "";
              return `<td class="${cls}">${v === undefined || v === null ? "—" : String(v)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("");
  out.append(h, t);
}

async function run() {
  document.getElementById("start").disabled = true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  ctx = Ctx ? new Ctx() : null;
  if (ctx) await ctx.resume();
  const manifest = await (await fetch("media/manifest.json")).json();

  results.env = {
    userAgent: navigator.userAgent,
    webAudio: Boolean(ctx),
    outputSampleRate: ctx ? ctx.sampleRate : null,
    baseLatency: ctx?.baseLatency ?? null,
    mediaSource: Boolean(window.MediaSource),
    managedMediaSource: Boolean(window.ManagedMediaSource),
    setSinkId: typeof HTMLMediaElement.prototype.setSinkId === "function",
  };

  // Declared support.
  for (const [key, mime] of Object.entries(MIME)) {
    const MS = window.ManagedMediaSource || window.MediaSource;
    results.capabilities.push({
      type: key,
      mime,
      canPlayType: document.createElement("audio").canPlayType(mime) || "no",
      mseIsTypeSupported: MS ? MS.isTypeSupported(mime) : false,
    });
  }
  table("Declared support", results.capabilities, ["type", "canPlayType", "mseIsTypeSupported"]);

  // Progressive playback (plain <audio src>).
  for (const f of manifest.files) {
    status.textContent = `Progressive: ${f.file}`;
    const audio = new Audio(`media/${f.file}`);
    audio.preload = "auto";
    let row = { id: f.id, file: f.file, rate: f.rate };
    try {
      await waitFor(audio, "canplay", 8000);
      row = {
        ...row,
        duration: Number(audio.duration.toFixed(3)),
        ...(await measurePlayback(audio)),
      };
    } catch (e) {
      row = { ...row, error: String(e.message ?? e), audible: false };
    }
    results.progressive.push(row);
  }
  table("Progressive playback", results.progressive, [
    "id",
    "rate",
    "duration",
    "advancedSeconds",
    "peakRms",
    "audible",
    "error",
  ]);

  // MSE playback of fragmented MP4.
  for (const f of manifest.files.filter((x) => x.container === "fmp4")) {
    status.textContent = `MSE: ${f.file}`;
    const mime = f.codec === "aac" ? MIME["fmp4-aac"] : MIME["fmp4-flac"];
    let row = { id: f.id, rate: f.rate };
    try {
      const { audio, managed, ranges } = await mseAudio(mime, [await fetchBuffer(f.file)]);
      row = {
        ...row,
        managed,
        buffered: JSON.stringify(ranges),
        ...(await measurePlayback(audio)),
      };
    } catch (e) {
      row = { ...row, error: String(e.message ?? e), audible: false };
    }
    results.mse.push(row);
  }
  table("MSE playback (fMP4)", results.mse, [
    "id",
    "rate",
    "managed",
    "buffered",
    "advancedSeconds",
    "peakRms",
    "audible",
    "error",
  ]);

  // Gapless: three album tracks appended to one SourceBuffer in sequence mode.
  for (const [kind, key, mime] of [
    ["flac", "flacMp4", MIME["fmp4-flac"]],
    ["aac", "aac", MIME["fmp4-aac"]],
  ]) {
    status.textContent = `Gapless MSE: ${kind}`;
    try {
      const buffers = [];
      for (const t of manifest.album) buffers.push(await fetchBuffer(t[key]));
      const { audio, ranges } = await mseAudio(mime, buffers, { sequence: true });
      // Play across the first track boundary (4.0 s) and record the minimum signal level.
      audio.currentTime = 3.6;
      // Small window (~5 ms at 48 kHz) so short gaps are not averaged away; sampled every ~2 ms.
      const rms = analyserFor(audio, 256);
      await audio.play();
      let min = 1;
      const end = performance.now() + 900;
      while (performance.now() < end) {
        const level = rms();
        if (audio.currentTime > 3.7 && level !== null) min = Math.min(min, level);
        await sleep(2);
      }
      audio.pause();
      results.gapless[kind] = {
        bufferedRanges: ranges,
        continuousBuffer: ranges.length === 1,
        totalSeconds: ranges.length ? ranges[ranges.length - 1][1] : 0,
        minRmsAcrossBoundary: ctx ? Number(min.toFixed(4)) : null,
        // A gap or click shows up as a dip far below the steady sine level (~0.177).
        noDropout: ctx ? min > 0.1 : "unmeasured",
      };
    } catch (e) {
      results.gapless[kind] = { error: String(e.message ?? e) };
    }
  }
  table(
    "Gapless (MSE, sequence mode)",
    Object.entries(results.gapless).map(([kind, r]) => ({
      kind,
      ...r,
      bufferedRanges: JSON.stringify(r.bufferedRanges),
    })),
    [
      "kind",
      "continuousBuffer",
      "totalSeconds",
      "minRmsAcrossBoundary",
      "noDropout",
      "bufferedRanges",
      "error",
    ],
  );

  json.value = JSON.stringify(results, null, 2);
  window.__results = results;
  status.textContent = `Done. Output sample rate: ${ctx ? ctx.sampleRate + " Hz" : "unknown"}.`;
}

document.getElementById("start").addEventListener("click", () => {
  run().catch((e) => {
    status.textContent = `Failed: ${e}`;
    window.__results = { fatal: String(e), ...results };
  });
});
