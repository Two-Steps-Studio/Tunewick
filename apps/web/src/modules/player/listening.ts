import type { QualityTier } from "@tunewick/shared";
import type { PlayerState } from "./types";

export interface Listen {
  trackId: string;
  startedAt: string;
  msPlayed: number;
  completed: boolean;
  tier: QualityTier | null;
  /** Soundcheck plays are recorded but never count towards payouts (D2). */
  soundcheck: boolean;
}

/** Only time actually heard counts: jumps larger than this (seeks) are not added. */
const MAX_STEP_S = 2;
/** Shorter than this is a skip, not a listen. */
const MIN_LISTEN_MS = 1000;

interface Current {
  key: string;
  trackId: string;
  startedAt: number;
  lastPosition: number;
  playedMs: number;
  duration: number;
  tier: QualityTier | null;
  soundcheck: boolean;
}

/**
 * Turns player state updates into listens: one per track occurrence, with the milliseconds
 * actually played (seeks and pauses excluded). `send` is called when the track changes, the
 * player stops, or `flush()` (page hide). Pure logic — tested without a browser.
 */
export class ListeningTracker {
  private current: Current | null = null;

  constructor(
    private readonly send: (listen: Listen) => void,
    private readonly now: () => number = Date.now,
  ) {}

  update(state: PlayerState) {
    const track = state.queue[state.index];
    // The same track twice in a row (playlist duplicates) is a new occurrence: key by index too.
    const key = track ? `${state.index}:${track.id}:${state.clip ? "clip" : "full"}` : "";
    if (!track || state.status === "idle" || state.status === "error") {
      this.flush();
      return;
    }
    if (this.current && this.current.key !== key) this.flush();
    if (!this.current) {
      this.current = {
        key,
        trackId: track.id,
        startedAt: this.now(),
        lastPosition: state.position,
        playedMs: 0,
        duration: state.duration,
        tier: state.now?.tier ?? null,
        soundcheck: state.clip !== null,
      };
      return;
    }
    const step = state.position - this.current.lastPosition;
    if (state.status === "playing" && step > 0 && step <= MAX_STEP_S) {
      this.current.playedMs += Math.round(step * 1000);
    }
    this.current.lastPosition = state.position;
    if (state.duration > 0) this.current.duration = state.duration;
    if (state.now?.tier) this.current.tier = state.now.tier;
  }

  /** Sends the current listen (if long enough) and starts counting afresh. */
  flush() {
    const current = this.current;
    this.current = null;
    if (!current || current.playedMs < MIN_LISTEN_MS) return;
    this.send({
      trackId: current.trackId,
      startedAt: new Date(current.startedAt).toISOString(),
      msPlayed: current.playedMs,
      completed: current.duration > 0 && current.lastPosition >= current.duration - 1,
      tier: current.tier,
      soundcheck: current.soundcheck,
    });
  }
}
