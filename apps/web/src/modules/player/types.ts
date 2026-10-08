import type { QualityTier, Rendition, SourceQuality, TierReason } from "@tunewick/shared";

/** One deliverable file of a track, with what the player needs for gapless trimming. */
export interface TrackRendition extends Rendition {
  url: string;
  bitDepth: number | null;
  /** Real average bitrate of this file (bytes × 8 / duration), kbit/s — for throughput decisions. */
  bitrateKbps: number;
  /** Encoder target for lossy variants (shown to listeners, e.g. "AAC 256 kbps"); null for FLAC. */
  nominalKbps: number | null;
  /** Playable samples per channel and AAC priming/padding (worker report). */
  samples: number;
  encoderDelaySamples: number;
  paddingSamples: number;
}

export interface PlayerTrack {
  id: string;
  title: string;
  artist: string;
  source: SourceQuality;
  renditions: TrackRendition[];
}

/** Why the delivered tier is below the best one (chooseTier reasons + engine-level ones). */
export type PlayerReason = TierReason | "stall" | "unplayable";
export type PlayerError = "media_error" | "stream_error" | "playback_blocked" | "unplayable";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface NowPlaying {
  tier: QualityTier;
  strategy: "mse" | "native";
  gapless: boolean;
  rendition: TrackRendition;
  /** Why the tier is below the best one available (chooseTier reasons + "unplayable"). */
  reasons: PlayerReason[];
}

export interface PlayerState {
  status: PlayerStatus;
  queue: readonly PlayerTrack[];
  index: number;
  /** Seconds into the current track. */
  position: number;
  duration: number;
  volume: number;
  now: NowPlaying | null;
  /** Device output rate (AudioContext), when known. */
  outputSampleRateHz: number | null;
  error: PlayerError | null;
  /** A soundcheck: only this excerpt (seconds into the track) plays, then the player stops. */
  clip: { start: number; end: number } | null;
}
