/**
 * Preview playback for the Discover feed: one excerpt at a time, natively (AAC, no MSE), with the
 * next card preloaded and everything behind unloaded — at most two media elements hold data.
 * Kept apart from the main PlayerEngine (gapless, quality tiers) on purpose: previews must start
 * instantly and stay cheap on weak networks. Framework-free; React reads it via subscribe/getState.
 */

import type { FeedItem } from "./types";

/** Seeks larger than this (or pauses) are not counted as listening. */
const MAX_STEP_S = 2;
/** Left before this much was heard = a skip. */
const SKIP_MS = 5_000;

export interface PreviewState {
  trackId: string | null;
  /** "unsupported": this browser cannot decode the preview (e.g. no AAC). */
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "blocked" | "unsupported" | "error";
  /** Milliseconds into the preview window. */
  position: number;
  length: number;
}

export interface PreviewListen {
  trackId: string;
  artistId: string;
  startedAt: string;
  msPlayed: number;
  completed: boolean;
}

export interface PreviewCallbacks {
  /**
   * A started preview stopped being current (scrolled away, ended, page hidden) — with how much
   * was really heard, so the feed can record a listen (≥ 1 s) or a skip.
   */
  onLeave: (listen: PreviewListen) => void;
  onEnded: (trackId: string) => void;
  onStarted: (trackId: string) => void;
}

type Network = { saveData?: boolean; effectiveType?: string };

/** Data Saver on slow or metered connections, High otherwise. */
export function pickSource(sources: FeedItem["preview"]["sources"]): string | null {
  const connection = (navigator as Navigator & { connection?: Network }).connection;
  const slow =
    connection?.saveData === true ||
    (connection?.effectiveType !== undefined && connection.effectiveType !== "4g");
  const preferred = sources.find((s) => s.tier === (slow ? "data_saver" : "high"));
  return (preferred ?? sources[0])?.url ?? null;
}

interface Slot {
  audio: HTMLAudioElement;
  item: FeedItem | null;
}

interface Session {
  item: FeedItem;
  startedAt: number;
  lastTime: number;
  playedMs: number;
  completed: boolean;
}

export class PreviewPlayer {
  private state: PreviewState = { trackId: null, status: "idle", position: 0, length: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly slots: [Slot, Slot];
  private active = 0;
  private session: Session | null = null;
  private wantsPlay = false;
  private callbacks: PreviewCallbacks = {
    onLeave: () => undefined,
    onEnded: () => undefined,
    onStarted: () => undefined,
  };

  constructor() {
    this.slots = [this.createSlot(), this.createSlot()];
  }

  /** Who hears about starts, ends and leaves (set from an effect, replaced on change). */
  setCallbacks(callbacks: Partial<PreviewCallbacks>) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private update(patch: Partial<PreviewState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private createSlot(): Slot {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const slot: Slot = { audio, item: null };
    audio.addEventListener("timeupdate", () => this.onTime(slot));
    audio.addEventListener("playing", () => {
      if (this.isActive(slot)) this.update({ status: "playing" });
    });
    audio.addEventListener("waiting", () => {
      if (this.isActive(slot) && this.wantsPlay) this.update({ status: "loading" });
    });
    audio.addEventListener("pause", () => {
      if (this.isActive(slot) && this.state.status === "playing") this.update({ status: "paused" });
    });
    audio.addEventListener("error", () => {
      if (!this.isActive(slot) || !audio.getAttribute("src")) return;
      const unsupported = audio.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
      this.update({ status: unsupported ? "unsupported" : "error" });
    });
    return slot;
  }

  private isActive(slot: Slot) {
    return this.slots[this.active] === slot;
  }

  /** Loads `item` into a slot and positions it at the window start (no play). */
  private prepare(slot: Slot, item: FeedItem) {
    if (slot.item?.trackId === item.trackId && slot.audio.getAttribute("src")) return;
    const url = pickSource(item.preview.sources);
    slot.item = item;
    if (!url) {
      this.unload(slot);
      slot.item = item;
      return;
    }
    const start = item.preview.startMs / 1000;
    slot.audio.src = `${url}#t=${start}`;
    const seek = () => {
      if (slot.item?.trackId === item.trackId && slot.audio.currentTime < start) {
        slot.audio.currentTime = start;
      }
    };
    slot.audio.addEventListener("loadedmetadata", seek, { once: true });
    slot.audio.load();
  }

  private unload(slot: Slot) {
    slot.item = null;
    slot.audio.pause();
    slot.audio.removeAttribute("src");
    slot.audio.load();
  }

  /**
   * Makes `item` current (and `next` the preloaded one). Plays when `autoplay` — browsers allow it
   * after the listener's first tap; otherwise the card shows a play button ("blocked").
   */
  async show(item: FeedItem, next: FeedItem | null, autoplay: boolean) {
    if (this.state.trackId === item.trackId) {
      if (next) this.prepare(this.slots[1 - this.active]!, next);
      return;
    }
    this.finishSession();
    const current = this.slots[this.active]!;
    const other = this.slots[1 - this.active]!;
    // Reuse the preloaded slot when it holds this item; the old current one is unloaded.
    if (other.item?.trackId === item.trackId) {
      current.audio.pause();
      this.unload(current);
      this.active = 1 - this.active;
    } else {
      this.unload(other);
      this.prepare(current, item);
    }
    const slot = this.slots[this.active]!;
    if (next) this.prepare(this.slots[1 - this.active]!, next);
    this.update({
      trackId: item.trackId,
      status: item.preview.sources.length ? "paused" : "error",
      position: 0,
      length: item.preview.lengthMs,
    });
    if (autoplay && item.preview.sources.length) await this.play(slot);
  }

  private async play(slot: Slot) {
    const item = slot.item;
    if (!item) return;
    this.wantsPlay = true;
    const start = item.preview.startMs / 1000;
    const end = (item.preview.startMs + item.preview.lengthMs) / 1000;
    if (slot.audio.currentTime < start || slot.audio.currentTime >= end - 0.25) {
      if (slot.audio.readyState >= HTMLMediaElement.HAVE_METADATA) slot.audio.currentTime = start;
    }
    this.session ??= {
      item,
      startedAt: Date.now(),
      lastTime: slot.audio.currentTime,
      playedMs: 0,
      completed: false,
    };
    this.update({ status: "loading" });
    try {
      await slot.audio.play();
      this.callbacks.onStarted(item.trackId);
    } catch (error) {
      this.wantsPlay = false;
      if (!this.isActive(slot)) return;
      this.update({
        status:
          error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error",
      });
    }
  }

  /** Play/pause from the card's button (a user gesture: also unlocks autoplay). */
  async toggle() {
    const slot = this.slots[this.active]!;
    if (!slot.item) return;
    if (!slot.audio.paused) {
      this.wantsPlay = false;
      slot.audio.pause();
      return;
    }
    if (this.state.status === "ended") {
      this.finishSession();
      this.update({ position: 0 });
    }
    await this.play(slot);
  }

  pause() {
    this.wantsPlay = false;
    this.slots[this.active]!.audio.pause();
  }

  private onTime(slot: Slot) {
    if (!this.isActive(slot) || !slot.item) return;
    const item = slot.item;
    const start = item.preview.startMs / 1000;
    const end = (item.preview.startMs + item.preview.lengthMs) / 1000;
    const time = slot.audio.currentTime;
    const session = this.session;
    if (session && session.item.trackId === item.trackId) {
      const step = time - session.lastTime;
      if (!slot.audio.paused && step > 0 && step <= MAX_STEP_S)
        session.playedMs += Math.round(step * 1000);
      session.lastTime = time;
    }
    this.update({ position: Math.max(0, Math.min(item.preview.lengthMs, (time - start) * 1000)) });
    if (time >= end) {
      slot.audio.pause();
      this.wantsPlay = false;
      if (session) session.completed = true;
      this.update({ status: "ended", position: item.preview.lengthMs });
      this.finishSession();
      this.callbacks.onEnded(item.trackId);
    }
  }

  /** Reports the current preview's listening (once) and forgets it. */
  finishSession() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    this.callbacks.onLeave({
      trackId: session.item.trackId,
      artistId: session.item.artist.id,
      startedAt: new Date(session.startedAt).toISOString(),
      msPlayed: session.playedMs,
      completed: session.completed,
    });
  }

  /** Was the current preview left too early to count as listened? */
  static isSkip(listen: Pick<PreviewListen, "msPlayed" | "completed">) {
    return !listen.completed && listen.msPlayed < SKIP_MS;
  }

  destroy() {
    this.finishSession();
    for (const slot of this.slots) this.unload(slot);
    this.listeners.clear();
  }
}
