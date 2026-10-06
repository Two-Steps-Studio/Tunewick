/**
 * One MediaSource feeding consecutive tracks into a single SourceBuffer — the gapless path
 * (docs/audio.md §4.2). Each track's fMP4 file is streamed with fetch and appended as it
 * arrives, placed on the timeline by planGaplessAppends (AAC priming/padding trimmed by the
 * append window). Appending stays ~30 s ahead of the playhead and played data is evicted, so the
 * browser's SourceBuffer quota (≈ 12 MB for audio in Chromium) is never the limit.
 */

import {
  applyAppendPlan,
  planGaplessAppends,
  type AppendPlan,
  type TrackTiming,
} from "@tunewick/shared";
import type { TrackRendition } from "../types";
import { mediaSourceConstructor } from "./probe";

const AHEAD_S = 30;
const BEHIND_S = 10;
const POLL_MS = 250;

export interface SessionEntry<T> {
  index: number;
  rendition: TrackRendition;
  plan: AppendPlan;
  /** Seconds into the track where appending started (seek into an unbuffered region). */
  startAt: number;
  data: T;
}

export class MseSession<T = unknown> {
  readonly entries: SessionEntry<T>[] = [];
  private readonly timings: TrackTiming[] = [];
  private readonly controller = new AbortController();
  private feeding: Promise<void> = Promise.resolve();
  private finished = false;

  private constructor(
    private readonly audio: HTMLAudioElement,
    private readonly source: MediaSource,
    private readonly buffer: SourceBuffer,
    private readonly url: string,
    readonly mime: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  static async open<T>(
    audio: HTMLAudioElement,
    mime: string,
    onError: (error: unknown) => void,
  ): Promise<MseSession<T>> {
    const Source = mediaSourceConstructor();
    if (!Source) throw new Error("MediaSource is not available");
    const source = new Source();
    const url = URL.createObjectURL(source);
    audio.disableRemotePlayback = true; // ManagedMediaSource (Safari) requires it
    await new Promise<void>((resolve, reject) => {
      source.addEventListener("sourceopen", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("media element error")), {
        once: true,
      });
      audio.src = url;
    });
    const buffer = source.addSourceBuffer(mime);
    buffer.mode = "segments";
    return new MseSession<T>(audio, source, buffer, url, mime, onError);
  }

  get closed() {
    return this.controller.signal.aborted;
  }

  /** Queues a track after the previous one; appending happens in order, in the background. */
  enqueue(index: number, rendition: TrackRendition, data: T, startAt = 0): SessionEntry<T> {
    this.timings.push({
      sampleRateHz: rendition.sampleRateHz,
      samples: rendition.samples,
      encoderDelaySamples: rendition.encoderDelaySamples,
      paddingSamples: rendition.paddingSamples,
    });
    const plan = planGaplessAppends(this.timings).at(-1)!;
    const entry: SessionEntry<T> = { index, rendition, plan, startAt, data };
    this.entries.push(entry);
    this.feeding = this.feeding
      .then(() => this.feed(entry))
      .catch((error: unknown) => {
        if (!this.closed) this.onError(error);
      });
    return entry;
  }

  /** No more tracks: end the stream once everything queued is appended. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    void this.feeding.then(async () => {
      if (this.closed || this.source.readyState !== "open") return;
      await this.settled();
      this.source.endOfStream();
    });
  }

  entryAt(time: number): SessionEntry<T> | undefined {
    return (
      this.entries.find(
        (entry) => time >= entry.plan.start + entry.startAt - 1e-3 && time < entry.plan.end,
      ) ?? (time >= (this.entries.at(-1)?.plan.end ?? Infinity) ? this.entries.at(-1) : undefined)
    );
  }

  isBuffered(time: number): boolean {
    const ranges = this.buffer.buffered;
    for (let i = 0; i < ranges.length; i++) {
      if (time >= ranges.start(i) && time < ranges.end(i) - 0.05) return true;
    }
    return false;
  }

  bufferedRanges(): [number, number][] {
    const ranges = this.buffer.buffered;
    return Array.from({ length: ranges.length }, (_, i) => [ranges.start(i), ranges.end(i)]);
  }

  close() {
    this.controller.abort();
    URL.revokeObjectURL(this.url);
  }

  private async feed(entry: SessionEntry<T>) {
    if (this.closed) return;
    await this.settled();
    applyAppendPlan(this.buffer, entry.plan);
    if (entry.startAt > 0) this.buffer.appendWindowStart = entry.plan.start + entry.startAt;

    const response = await fetch(entry.rendition.url, { signal: this.controller.signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for audio`);
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done || this.closed) break;
      await this.room();
      await this.append(value);
    }
  }

  private bufferedEnd() {
    const ranges = this.buffer.buffered;
    return ranges.length ? ranges.end(ranges.length - 1) : 0;
  }

  private async room() {
    while (!this.closed && this.bufferedEnd() - this.audio.currentTime > AHEAD_S) {
      await sleep(POLL_MS);
    }
  }

  private async append(chunk: Uint8Array) {
    for (;;) {
      if (this.closed) return;
      try {
        this.buffer.appendBuffer(chunk as Uint8Array<ArrayBuffer>);
        await this.settled();
        return;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
        await this.evict();
        await sleep(POLL_MS * 2);
      }
    }
  }

  private async evict() {
    const keepFrom = this.audio.currentTime - BEHIND_S;
    const ranges = this.buffer.buffered;
    if (ranges.length && ranges.start(0) < keepFrom) {
      this.buffer.remove(0, keepFrom);
      await this.settled();
    }
  }

  private settled(): Promise<void> {
    if (!this.buffer.updating) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        this.buffer.removeEventListener("updateend", done);
        this.buffer.removeEventListener("error", fail);
        resolve();
      };
      const fail = () => {
        this.buffer.removeEventListener("updateend", done);
        this.buffer.removeEventListener("error", fail);
        reject(new Error("SourceBuffer append failed"));
      };
      this.buffer.addEventListener("updateend", done);
      this.buffer.addEventListener("error", fail);
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
