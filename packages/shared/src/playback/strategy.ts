/**
 * Which file to play and how (docs/audio.md §4, spike results §9.2).
 *
 * Strategy MSE: fMP4 through MediaSource / ManagedMediaSource — truly gapless.
 * Strategy native: the file in an <audio> element — gapless best-effort (compromise C2).
 *
 * Capabilities must come from a real decode probe; `canPlayType`/`isTypeSupported` alone lie
 * (the Windows WebKit port answered "probably" for FLAC and never played it). The known-broken
 * list is a second safety net for failures a probe cannot see (e.g. decoding to silence).
 */

import type { DeliveryCodec, QualityTier } from "../quality";
import { tierBelow } from "./tiers";

export type Container = "flac" | "fmp4";
export type Strategy = "mse" | "native";
export type Engine = "chromium" | "gecko" | "webkit" | "unknown";

export interface Rendition {
  tier: QualityTier;
  codec: DeliveryCodec;
  container: Container;
  sampleRateHz: number;
}

export interface PlaybackCapabilities {
  engine: Engine;
  /** MediaSource or ManagedMediaSource exists. */
  mse: boolean;
  /** Real-decode probe results per path. */
  decodes: {
    mseAac: boolean;
    mseFlac: boolean;
    nativeAac: boolean;
    nativeFlac: boolean;
    /** Plain FLAC above 48 kHz. */
    nativeFlacHiRes: boolean;
  };
}

export interface PlaybackChoice {
  rendition: Rendition;
  strategy: Strategy;
  gapless: boolean;
}

type Path = "mseAac" | "mseFlac" | "nativeAac" | "nativeFlac" | "nativeFlacHiRes";

export interface KnownBroken {
  engine: Engine;
  path: Path;
  reason: string;
}

export const KNOWN_BROKEN: readonly KnownBroken[] = [
  {
    engine: "webkit",
    path: "mseFlac",
    reason:
      "Safari has reported FLAC-in-MP4 MSE support while playing silence; native FLAC until " +
      "real-device tests (spike M3.0) prove otherwise.",
  },
];

/** fMP4 FLAC above 48 kHz fails in Firefox (spike), so the worker never produces it for MSE. */
const MAX_MSE_FLAC_RATE = 48000;

function usable(caps: PlaybackCapabilities, path: Path): boolean {
  if (!caps.decodes[path]) return false;
  return !KNOWN_BROKEN.some((entry) => entry.engine === caps.engine && entry.path === path);
}

function pathFor(rendition: Rendition, strategy: Strategy): Path | null {
  if (strategy === "mse") {
    if (rendition.container !== "fmp4") return null;
    if (rendition.codec === "aac_lc") return "mseAac";
    return rendition.sampleRateHz <= MAX_MSE_FLAC_RATE ? "mseFlac" : null;
  }
  if (rendition.codec === "aac_lc") return "nativeAac";
  if (rendition.container !== "flac") return null; // native FLAC uses the plain file
  return rendition.sampleRateHz > 48000 ? "nativeFlacHiRes" : "nativeFlac";
}

/** Best way to play one tier: MSE when possible (gapless), otherwise native; null if neither. */
export function choosePlayback(
  renditions: readonly Rendition[],
  tier: QualityTier,
  caps: PlaybackCapabilities,
): PlaybackChoice | null {
  const candidates = renditions.filter((rendition) => rendition.tier === tier);
  for (const strategy of ["mse", "native"] as const) {
    if (strategy === "mse" && !caps.mse) continue;
    for (const rendition of candidates) {
      const path = pathFor(rendition, strategy);
      if (path && usable(caps, path)) {
        return { rendition, strategy, gapless: strategy === "mse" };
      }
    }
  }
  return null;
}

/** Tiers of this track that can actually be played on this device. */
export function playableTiers(
  renditions: readonly Rendition[],
  caps: PlaybackCapabilities,
): QualityTier[] {
  const tiers = [...new Set(renditions.map((rendition) => rendition.tier))];
  return tiers.filter((tier) => choosePlayback(renditions, tier, caps) !== null);
}

/** The requested tier, or the nearest lower tier that plays here. */
export function resolvePlayback(
  renditions: readonly Rendition[],
  tier: QualityTier,
  caps: PlaybackCapabilities,
): (PlaybackChoice & { steppedDown: boolean }) | null {
  for (let current: QualityTier | null = tier; current; current = tierBelow(current)) {
    const choice = choosePlayback(renditions, current, caps);
    if (choice) return { ...choice, steppedDown: current !== tier };
  }
  return null;
}
