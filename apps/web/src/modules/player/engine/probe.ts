/**
 * What this browser really decodes (docs/audio.md §4). Each path is tested by decoding a tiny
 * file from /player-probe/ — `canPlayType`/`isTypeSupported` are only a first filter, because
 * engines answer "probably" for formats they then fail to play (spike M3.0). Failures a decode
 * test cannot see (e.g. decoding to silence) are covered by KNOWN_BROKEN in @tunewick/shared.
 */

import type { Engine, PlaybackCapabilities } from "@tunewick/shared";

export const AAC_MIME = 'audio/mp4; codecs="mp4a.40.2"';
export const FLAC_MIME = 'audio/mp4; codecs="flac"';

const PROBE = "/player-probe";
const TIMEOUT_MS = 4000;
const CACHE_KEY = "tw.player.capabilities.v1";

type MediaSourceCtor = typeof MediaSource;

export function mediaSourceConstructor(): MediaSourceCtor | null {
  const scope = globalThis as unknown as {
    ManagedMediaSource?: MediaSourceCtor;
    MediaSource?: MediaSourceCtor;
  };
  return scope.ManagedMediaSource ?? scope.MediaSource ?? null;
}

export function detectEngine(userAgent: string): Engine {
  if (/Firefox\//.test(userAgent)) return "gecko";
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return "chromium";
  if (/AppleWebKit\//.test(userAgent)) return "webkit";
  return "unknown";
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
  ]);
}

function once(target: EventTarget, ok: string, fail: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (value: boolean) => () => {
      target.removeEventListener(ok, onOk);
      target.removeEventListener(fail, onFail);
      resolve(value);
    };
    const onOk = done(true);
    const onFail = done(false);
    target.addEventListener(ok, onOk);
    target.addEventListener(fail, onFail);
  });
}

function release(audio: HTMLAudioElement, url?: string) {
  audio.removeAttribute("src");
  audio.load();
  if (url) URL.revokeObjectURL(url);
}

async function nativeDecodes(file: string, mime: string): Promise<boolean> {
  const audio = document.createElement("audio");
  if (!audio.canPlayType(mime)) return false;
  audio.muted = true;
  audio.preload = "auto";
  const loaded = once(audio, "loadeddata", "error");
  audio.src = `${PROBE}/${file}`;
  try {
    return (await withTimeout(loaded, false)) && audio.duration > 0;
  } finally {
    release(audio);
  }
}

async function mseDecodes(file: string, mime: string): Promise<boolean> {
  const Source = mediaSourceConstructor();
  if (!Source?.isTypeSupported(mime)) return false;
  const audio = document.createElement("audio");
  audio.muted = true;
  audio.disableRemotePlayback = true; // required for ManagedMediaSource
  const source = new Source();
  const url = URL.createObjectURL(source);
  try {
    const opened = once(source, "sourceopen", "error");
    audio.src = url;
    if (!(await withTimeout(opened, false))) return false;
    const data = await (await fetch(`${PROBE}/${file}`)).arrayBuffer();
    const buffer = source.addSourceBuffer(mime);
    const appended = once(buffer, "updateend", "error");
    buffer.appendBuffer(data);
    if (!(await withTimeout(appended, false))) return false;
    source.endOfStream();
    const decodable =
      audio.readyState >= 2 || (await withTimeout(once(audio, "loadeddata", "error"), false));
    return decodable && buffer.buffered.length > 0 && buffer.buffered.end(0) > 0.1;
  } catch {
    return false;
  } finally {
    release(audio, url);
  }
}

async function measure(): Promise<PlaybackCapabilities> {
  const mse = mediaSourceConstructor() !== null;
  const [mseAac, mseFlac, nativeAac, nativeFlac, nativeFlacHiRes] = await Promise.all([
    mse ? mseDecodes("aac.mp4", AAC_MIME) : false,
    mse ? mseDecodes("flac.mp4", FLAC_MIME) : false,
    nativeDecodes("aac.mp4", "audio/mp4"),
    nativeDecodes("flac-48.flac", "audio/flac"),
    nativeDecodes("flac-96.flac", "audio/flac"),
  ]);
  return {
    engine: detectEngine(navigator.userAgent),
    mse,
    decodes: { mseAac, mseFlac, nativeAac, nativeFlac, nativeFlacHiRes },
  };
}

let pending: Promise<PlaybackCapabilities> | null = null;

/** Measured once per tab session; storage failures (private mode) just mean re-measuring. */
export function probeCapabilities(): Promise<PlaybackCapabilities> {
  pending ??= (async () => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached) as PlaybackCapabilities;
    } catch {}
    const result = await measure();
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
    } catch {}
    return result;
  })();
  return pending;
}
