/**
 * Gapless MSE append plan (docs/audio.md §4.2, spike results §9.2).
 *
 * Consecutive tracks are appended to one SourceBuffer. Each track is shifted so its first real
 * sample lands exactly where the previous track's last real sample ended, and the append window
 * cuts the encoder priming (AAC: 1024 samples) and end padding. Without this trim every AAC
 * boundary had a measurable dropout in the spike; FLAC has no priming, so its window is the whole
 * track.
 *
 * Track starts are summed in samples per sample rate (not in floating-point seconds), so error
 * does not accumulate over long albums.
 */

export interface TrackTiming {
  sampleRateHz: number;
  /** Playable samples per channel (worker report `samples`). */
  samples: number;
  encoderDelaySamples: number;
  paddingSamples: number;
}

export interface AppendPlan {
  /** Seconds on the MediaSource timeline where the track's first playable sample sits. */
  start: number;
  end: number;
  /** Value for `SourceBuffer.timestampOffset` before appending the track's media segments. */
  timestampOffset: number;
  appendWindowStart: number;
  appendWindowEnd: number;
}

function assertTiming(track: TrackTiming, index: number) {
  const counts = [track.samples, track.encoderDelaySamples, track.paddingSamples];
  if (!Number.isInteger(track.sampleRateHz) || track.sampleRateHz <= 0) {
    throw new RangeError(`track ${index}: invalid sample rate`);
  }
  if (counts.some((value) => !Number.isInteger(value) || value < 0) || track.samples === 0) {
    throw new RangeError(`track ${index}: sample counts must be non-negative integers`);
  }
}

export function planGaplessAppends(tracks: readonly TrackTiming[]): AppendPlan[] {
  const elapsed = new Map<number, number>(); // sample rate → samples already placed
  const position = () =>
    [...elapsed].reduce((seconds, [rate, samples]) => seconds + samples / rate, 0);

  return tracks.map((track, index) => {
    assertTiming(track, index);
    const start = position();
    elapsed.set(track.sampleRateHz, (elapsed.get(track.sampleRateHz) ?? 0) + track.samples);
    const end = position();
    return {
      start,
      end,
      timestampOffset: start - track.encoderDelaySamples / track.sampleRateHz,
      appendWindowStart: start,
      appendWindowEnd: end,
    };
  });
}

/**
 * Applies a plan entry in an order the MSE spec accepts: `appendWindowStart` must stay below
 * `appendWindowEnd` at every step, so the end is opened first.
 */
export function applyAppendPlan(
  buffer: { timestampOffset: number; appendWindowStart: number; appendWindowEnd: number },
  plan: AppendPlan,
) {
  buffer.appendWindowEnd = Infinity;
  buffer.appendWindowStart = plan.appendWindowStart;
  buffer.appendWindowEnd = plan.appendWindowEnd;
  buffer.timestampOffset = plan.timestampOffset;
}
