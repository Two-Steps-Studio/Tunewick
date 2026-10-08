import type { QualityTier } from "@tunewick/shared";
import type { PlayerError, PlayerState } from "./types";

export interface PlaybackMetric {
  outcome: "started" | "error";
  tier: QualityTier | null;
  strategy: "mse" | "native" | null;
  firstAudioMs: number | null;
  errorCode: PlayerError | null;
}

/**
 * Turns player state changes into telemetry: time from "loading" to "playing" (time to first
 * audio), and errors. One metric per load. Pure logic — tested without a browser.
 */
export class PlaybackMetrics {
  private loadingSince: number | null = null;
  private previous: PlayerState["status"] = "idle";

  constructor(
    private readonly send: (metric: PlaybackMetric) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  update(state: PlayerState) {
    const status = state.status;
    if (status === "loading" && this.previous !== "loading") {
      this.loadingSince = this.now();
    } else if (status === "playing" && this.loadingSince !== null) {
      this.send({
        outcome: "started",
        tier: state.now?.tier ?? null,
        strategy: state.now?.strategy ?? null,
        firstAudioMs: Math.round(this.now() - this.loadingSince),
        errorCode: null,
      });
      this.loadingSince = null;
    } else if (status === "error" && this.previous !== "error") {
      this.send({
        outcome: "error",
        tier: state.now?.tier ?? null,
        strategy: state.now?.strategy ?? null,
        firstAudioMs: null,
        errorCode: state.error,
      });
      this.loadingSince = null;
    } else if (status === "paused") {
      // A load that ends paused (autoplay blocked, a choice to pause) measures nothing.
      this.loadingSince = null;
    }
    this.previous = status;
  }
}

/** Browser family only — never the full user agent. */
export function browserFamily(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "edge";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Chrome\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}
