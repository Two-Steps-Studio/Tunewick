/**
 * The player engine: one <audio> element, a queue, and per track a strategy chosen from what
 * this browser really decodes (docs/audio.md §4). Consecutive MSE-playable tracks share one
 * MediaSource (gapless); anything else plays natively, one file after another.
 *
 * Framework-free: React reads it through subscribe/getState (useSyncExternalStore).
 */

import {
  chooseTier,
  playableTiers,
  resolvePlayback,
  tierAfterStall,
  tierRank,
  TIER_ORDER,
  type AvailableVariant,
  type NetworkInfo,
  type PlaybackCapabilities,
  type QualitySetting,
  type QualityTier,
} from "@tunewick/shared";
import type {
  NowPlaying,
  PlayerError,
  PlayerReason,
  PlayerState,
  PlayerTrack,
  RepeatMode,
  TrackRendition,
} from "../types";
import { MseSession } from "./mse-session";
import { AAC_MIME, FLAC_MIME, probeCapabilities } from "./probe";

const VOLUME_KEY = "tw.player.volume";
const MODES_KEY = "tw.player.modes";
const STALL_MS = 4000;
const RESTART_THRESHOLD_S = 3;

export const IDLE_STATE: PlayerState = {
  status: "idle",
  queue: [],
  index: 0,
  position: 0,
  duration: 0,
  volume: 1,
  now: null,
  outputSampleRateHz: null,
  error: null,
  clip: null,
  repeat: "off",
  shuffle: false,
  occurrence: 0,
};

/** Fisher-Yates on a copy. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function readNetwork(): NetworkInfo {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: NetworkInfo["effectiveType"] };
    }
  ).connection;
  return { saveData: connection?.saveData, effectiveType: connection?.effectiveType };
}

function mimeFor(rendition: TrackRendition) {
  return rendition.codec === "aac_lc" ? AAC_MIME : FLAC_MIME;
}

export interface EngineDebug {
  strategy: "mse" | "native" | null;
  currentTime: number;
  mediaDuration: number;
  buffered: [number, number][];
  sessionTracks: number[];
  capabilities: PlaybackCapabilities | null;
}

export class PlayerEngine {
  private state: PlayerState = IDLE_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly audio: HTMLAudioElement;
  private session: MseSession<NowPlaying> | null = null;
  private capabilities: PlaybackCapabilities | null = null;
  private setting: QualitySetting = "auto";
  private entitlement: QualityTier = "high";
  /** Lowered after a stall; cleared when a new queue starts. */
  private stallCap: QualityTier | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** Invalidates async work started for an earlier play/jump. */
  private generation = 0;
  /** The queue in its own order while shuffle is on (restored when shuffle goes off). */
  private original: PlayerTrack[] | null = null;
  /** Volume before mute (the M key). */
  private unmutedVolume = 1;

  constructor() {
    this.audio = document.createElement("audio");
    this.audio.preload = "auto";
    let volume = 1;
    try {
      const stored = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && stored >= 0 && stored <= 1) volume = stored;
    } catch {}
    this.audio.volume = volume;
    let modes: { repeat?: RepeatMode; shuffle?: boolean } = {};
    try {
      modes = JSON.parse(localStorage.getItem(MODES_KEY) ?? "{}") as typeof modes;
    } catch {}
    const repeat = (["off", "all", "one"] as const).includes(modes.repeat!) ? modes.repeat! : "off";
    this.state = { ...IDLE_STATE, volume, repeat, shuffle: modes.shuffle === true };

    this.audio.addEventListener("timeupdate", () => this.syncPosition());
    this.audio.addEventListener("durationchange", () => this.syncPosition());
    this.audio.addEventListener("playing", () => {
      this.clearStall();
      this.update({ status: "playing", error: null });
    });
    this.audio.addEventListener("pause", () => {
      if (this.state.status === "playing") this.update({ status: "paused" });
    });
    this.audio.addEventListener("waiting", () => this.onWaiting());
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("error", () => {
      if (this.audio.getAttribute("src")) this.fail("media_error");
    });
    this.setupMediaSession();
  }

  // --- store -----------------------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private update(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // --- public controls -------------------------------------------------------------------------

  configure(options: { setting?: QualitySetting; entitlement?: QualityTier }) {
    if (options.setting) this.setting = options.setting;
    if (options.entitlement) this.entitlement = options.entitlement;
  }

  async playQueue(queue: readonly PlayerTrack[], startIndex = 0) {
    if (!queue.length) return;
    this.stallCap = null;
    this.measureOutputRate();
    let order = queue;
    let index = startIndex;
    if (this.state.shuffle) {
      // Shuffle mode: the chosen track first, the rest in random order.
      this.original = queue.slice();
      const chosen = queue[startIndex]!;
      order = [chosen, ...shuffled(queue.filter((_, i) => i !== startIndex))];
      index = 0;
    } else {
      this.original = null;
    }
    this.update({ queue: order, index, error: null, clip: null });
    await this.start(index, 0, true, true);
  }

  /** Plays the queue from a random track, with shuffle mode on (the "Shuffle" buttons). */
  async playShuffled(queue: readonly PlayerTrack[]) {
    if (!queue.length) return;
    this.setShuffleMode(true);
    await this.playQueue(queue, Math.floor(Math.random() * queue.length));
  }

  /** Plays a soundcheck: `length` seconds of `track` from `start`, then stops. */
  async playClip(track: PlayerTrack, start: number, length: number) {
    this.stallCap = null;
    this.measureOutputRate();
    this.original = null;
    this.update({ queue: [track], index: 0, error: null, clip: { start, end: start + length } });
    await this.start(0, start, true, true);
  }

  toggle() {
    if (this.audio.paused) void this.resume();
    else this.audio.pause();
  }

  async resume() {
    if (!this.state.queue.length) return;
    // A finished soundcheck plays again from the start of the excerpt.
    const clip = this.state.clip;
    if (clip && this.state.position >= clip.end - 0.25) {
      await this.start(this.state.index, clip.start, true, true);
      return;
    }
    try {
      await this.audio.play();
    } catch {
      this.fail("playback_blocked");
    }
  }

  pause() {
    this.audio.pause();
  }

  async next() {
    const target = this.state.index + 1;
    if (target < this.state.queue.length) await this.jump(target);
    else if (this.state.repeat === "all" && this.state.queue.length) await this.jump(0);
  }

  async previous() {
    if (this.state.position > RESTART_THRESHOLD_S || this.state.index === 0) {
      await this.seek(0);
    } else {
      await this.jump(this.state.index - 1);
    }
  }

  async seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, this.state.duration || seconds));
    const entry = this.session?.entries.find((e) => e.index === this.state.index);
    if (this.session && entry) {
      const time = entry.plan.start + target;
      if (this.session.isBuffered(time)) {
        this.audio.currentTime = time;
      } else {
        await this.start(this.state.index, target, !this.audio.paused, false);
      }
    } else if (this.state.now) {
      this.audio.currentTime = target;
    }
  }

  toggleMute() {
    if (this.state.volume > 0) {
      this.unmutedVolume = this.state.volume;
      this.setVolume(0);
    } else {
      this.setVolume(this.unmutedVolume || 1);
    }
  }

  /** off → all → one → off, like most players. */
  cycleRepeat() {
    const next: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
    this.update({ repeat: next[this.state.repeat] });
    this.saveModes();
  }

  /**
   * Shuffle on: the playing track stays, everything else is shuffled. Off: the queue's own order
   * comes back, continuing from the playing track.
   */
  toggleShuffle() {
    this.setShuffleMode(!this.state.shuffle);
  }

  private setShuffleMode(on: boolean) {
    if (on === this.state.shuffle) return;
    const { queue, index } = this.state;
    const current = queue[index];
    if (on) {
      this.original = queue.slice();
      if (current && !this.state.clip) {
        this.reorder([current, ...shuffled(queue.filter((_, i) => i !== index))], 0);
      }
    } else if (this.original && current) {
      const back = this.original.indexOf(current);
      if (back >= 0) this.reorder(this.original, back);
      this.original = null;
    } else {
      this.original = null;
    }
    this.update({ shuffle: on });
    this.saveModes();
  }

  /** Plays `track` right after the current one. */
  playNext(track: PlayerTrack) {
    if (!this.state.queue.length || this.state.clip) return void this.playQueue([track], 0);
    const at = this.state.index + 1;
    const queue = [...this.state.queue.slice(0, at), track, ...this.state.queue.slice(at)];
    if (this.original) {
      const current = this.state.queue[this.state.index];
      const pos = current ? this.original.indexOf(current) + 1 : this.original.length;
      this.original.splice(pos, 0, track);
    }
    this.reorder(queue, this.state.index);
  }

  /** Adds `track` at the end of the queue. */
  addToQueue(track: PlayerTrack) {
    if (!this.state.queue.length || this.state.clip) return void this.playQueue([track], 0);
    this.original?.push(track);
    // Nothing already planned moves: the gapless session picks the new track up, or the player
    // starts it when the planned ones end.
    this.update({ queue: [...this.state.queue, track] });
  }

  /** Removes an upcoming queue item (not the playing one). */
  removeFromQueue(index: number) {
    if (index <= this.state.index || index >= this.state.queue.length) return;
    const removed = this.state.queue[index];
    const queue = this.state.queue.filter((_, i) => i !== index);
    if (this.original && removed) {
      const pos = this.original.indexOf(removed);
      if (pos >= 0) this.original.splice(pos, 1);
    }
    this.reorder(queue, this.state.index);
  }

  /** Plays the queue item at `index` (from the queue panel). */
  async playAt(index: number) {
    if (index >= 0 && index < this.state.queue.length) await this.jump(index);
  }

  setVolume(volume: number) {
    const value = Math.max(0, Math.min(1, volume));
    this.audio.volume = value;
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {}
    this.update({ volume: value });
  }

  debug(): EngineDebug {
    const ranges = this.audio.buffered;
    return {
      strategy: this.state.now?.strategy ?? null,
      currentTime: this.audio.currentTime,
      mediaDuration: this.audio.duration,
      buffered: Array.from({ length: ranges.length }, (_, i) => [ranges.start(i), ranges.end(i)]),
      sessionTracks: this.session?.entries.map((entry) => entry.index) ?? [],
      capabilities: this.capabilities,
    };
  }

  // --- internals -------------------------------------------------------------------------------

  private async decide(index: number): Promise<NowPlaying | null> {
    const caps = (this.capabilities ??= await probeCapabilities());
    const track = this.state.queue[index];
    if (!track) return null;

    const playable = playableTiers(track.renditions, caps);
    const available: AvailableVariant[] = playable.map((tier) => ({
      tier,
      bitrateKbps: Math.min(
        ...track.renditions.filter((r) => r.tier === tier).map((r) => r.bitrateKbps),
      ),
    }));
    const entitlement =
      this.stallCap && tierRank(this.stallCap) < tierRank(this.entitlement)
        ? this.stallCap
        : this.entitlement;
    const decision = chooseTier({
      setting: this.setting,
      entitlement,
      available,
      network: readNetwork(),
    });
    if (!decision) return null;
    const choice = resolvePlayback(track.renditions, decision.tier, caps);
    if (!choice) return null;

    const reasons: PlayerReason[] = decision.reasons.filter(
      (r) => !(r === "plan" && this.stallCap),
    );
    if (this.stallCap) reasons.push("stall");
    const best = TIER_ORDER.filter((tier) => track.renditions.some((r) => r.tier === tier)).at(-1);
    if (best && !playable.includes(best)) reasons.push("unplayable");

    return {
      tier: choice.rendition.tier,
      strategy: choice.strategy,
      gapless: choice.gapless,
      rendition: choice.rendition as TrackRendition,
      reasons,
    };
  }

  /**
   * Replaces the queue while the same track keeps playing at `index`. A gapless session has the
   * old order queued (by index), so it is rebuilt from the current position - a short rebuffer,
   * the song does not restart. The listen goes on (same occurrence).
   */
  private reorder(queue: readonly PlayerTrack[], index: number) {
    this.update({ queue, index });
    if (this.session && this.state.now) {
      void this.start(index, this.state.position, !this.audio.paused, false);
    }
  }

  private saveModes() {
    try {
      localStorage.setItem(
        MODES_KEY,
        JSON.stringify({ repeat: this.state.repeat, shuffle: this.state.shuffle }),
      );
    } catch {}
  }

  private closeSession() {
    this.session?.close();
    this.session = null;
  }

  /**
   * Starts playback of queue[index] at `offset` seconds, rebuilding the pipeline. `fresh`: a new
   * start of the track (a new listen), as opposed to resuming it elsewhere (seek, stall, reorder).
   */
  private async start(index: number, offset: number, autoplay = true, fresh = true) {
    const generation = ++this.generation;
    this.clearStall();
    this.closeSession();
    this.update({
      index,
      position: offset,
      status: "loading",
      error: null,
      occurrence: fresh ? this.state.occurrence + 1 : this.state.occurrence,
    });

    const now = await this.decide(index);
    if (generation !== this.generation) return;
    if (!now) return this.fail("unplayable");
    this.update({ now, duration: now.rendition.samples / now.rendition.sampleRateHz });
    this.updateMediaSession();

    try {
      if (now.strategy === "mse") {
        const session = await MseSession.open<NowPlaying>(this.audio, mimeFor(now.rendition), () =>
          this.fail("stream_error"),
        );
        if (generation !== this.generation) return session.close();
        this.session = session;
        session.enqueue(index, now.rendition, now, offset);
        void this.extendSession(session, index, generation);
        this.audio.currentTime = offset;
      } else {
        this.audio.src = now.rendition.url;
        if (offset > 0) {
          this.audio.addEventListener("loadedmetadata", () => (this.audio.currentTime = offset), {
            once: true,
          });
        }
      }
      if (autoplay) await this.audio.play();
      else this.update({ status: "paused" });
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "playback_blocked"
          : "media_error",
      );
    }
  }

  /** Appends following tracks to the same MediaSource while they use the same codec. */
  private async extendSession(session: MseSession<NowPlaying>, from: number, generation: number) {
    // Repeat one: nothing follows; the track restarts when it ends (onEnded).
    if (this.state.repeat === "one") return session.finish();
    for (let index = from + 1; index < this.state.queue.length; index++) {
      const now = await this.decide(index);
      if (generation !== this.generation || session.closed) return;
      if (!now || now.strategy !== "mse" || mimeFor(now.rendition) !== session.mime) break;
      session.enqueue(index, now.rendition, now);
    }
    session.finish();
  }

  private async jump(index: number) {
    const entry = this.session?.entries.find((e) => e.index === index);
    if (this.session && entry && this.session.isBuffered(entry.plan.start)) {
      this.audio.currentTime = entry.plan.start;
      return;
    }
    await this.start(index, 0, true, true);
  }

  private syncPosition() {
    if (this.session) {
      const entry = this.session.entryAt(this.audio.currentTime);
      if (!entry) return;
      const trackChanged = entry.index !== this.state.index;
      // Repeat one inside a gapless session: the next track was already queued - go back.
      if (trackChanged && this.state.repeat === "one" && entry.index === this.state.index + 1) {
        this.update({ occurrence: this.state.occurrence + 1 }); // the replay is a new listen
        void this.jump(this.state.index);
        return;
      }
      this.update({
        index: entry.index,
        occurrence: trackChanged ? this.state.occurrence + 1 : this.state.occurrence,
        now: entry.data,
        position: Math.max(0, this.audio.currentTime - entry.plan.start),
        duration: entry.plan.end - entry.plan.start,
      });
      if (trackChanged) this.updateMediaSession();
    } else if (this.state.now) {
      const duration = Number.isFinite(this.audio.duration)
        ? this.audio.duration
        : this.state.duration;
      this.update({ position: this.audio.currentTime, duration });
    }
    const clip = this.state.clip;
    if (clip && this.state.position >= clip.end && !this.audio.paused) {
      this.audio.pause();
      this.update({ status: "paused", position: clip.end });
    }
    this.updatePositionState();
  }

  private onEnded() {
    if (this.state.repeat === "one" && !this.state.clip) {
      void this.start(this.state.index, 0, true, true);
      return;
    }
    const last = this.session?.entries.at(-1)?.index ?? this.state.index;
    const next = last + 1;
    if (next < this.state.queue.length) {
      void this.start(next, 0, true, true);
    } else if (this.state.repeat === "all" && !this.state.clip) {
      void this.start(0, 0, true, true);
    } else {
      this.update({ status: "paused", position: this.state.duration });
    }
  }

  private onWaiting() {
    if (this.audio.paused || this.stallTimer) return;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      const now = this.state.now;
      const track = this.state.queue[this.state.index];
      if (!now || !track) return;
      const available = track.renditions.map((r) => ({ tier: r.tier, bitrateKbps: r.bitrateKbps }));
      const lower = tierAfterStall(now.tier, available);
      if (!lower) return;
      this.stallCap = lower;
      void this.start(this.state.index, this.state.position, true, false);
    }, STALL_MS);
  }

  private clearStall() {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  private fail(error: PlayerError) {
    this.update({ status: "error", error });
  }

  private measureOutputRate() {
    if (this.state.outputSampleRateHz !== null) return;
    try {
      const context = new AudioContext();
      this.update({ outputSampleRateHz: context.sampleRate });
      void context.close();
    } catch {}
  }

  // --- Media Session (lock screen, headphones, OS media keys) ----------------------------------

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => void this.resume()],
      ["pause", () => this.pause()],
      ["nexttrack", () => void this.next()],
      ["previoustrack", () => void this.previous()],
      ["seekto", (details) => void this.seek(details.seekTime ?? 0)],
      // No ±10 s seek actions: with them, lock screens and headphones show skip-10-s instead
      // of previous/next track.
      ["seekbackward", null],
      ["seekforward", null],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    }
  }

  private updateMediaSession() {
    const track = this.state.queue[this.state.index];
    if (!("mediaSession" in navigator) || !track) return;
    // Without artwork, iOS and Android show the site icon on the lock screen instead of the cover.
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: (track.artwork ?? []).map((image) => ({
        src: image.url,
        sizes: `${image.width}x${image.width}`,
        type: "image/webp",
      })),
    });
  }

  private updatePositionState() {
    if (!("mediaSession" in navigator) || !this.state.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.state.duration,
        position: Math.min(this.state.position, this.state.duration),
        playbackRate: 1,
      });
    } catch {}
  }
}
