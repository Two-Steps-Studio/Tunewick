"""Spectral "cliff" detection (docs/audio.md §2.3).

Lossy encoders and upsampling both leave a brick-wall low-pass: audio content up to a frequency,
then (almost) nothing up to Nyquist. Natural roll-off of real recordings is gradual, so a steep
drop that stays down is the signal. This is a heuristic — results are flags, and a moderator can
override them (with an audit-log entry).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_DROP_DB = 25.0  # level difference between just below and everywhere above the cliff
SMOOTH_HZ = 100.0
GRID_HZ = 50.0
SEARCH_FROM_HZ = 5000.0


@dataclass
class Cliff:
    frequency_hz: float | None  # None → no brick-wall cutoff below Nyquist
    drop_db: float  # strongest drop found (also reported when below the threshold)


def find_cliff(power: np.ndarray, freqs: np.ndarray, sample_rate: int) -> Cliff:
    nyquist = sample_rate / 2
    df = float(freqs[1] - freqs[0])
    width = max(1, round(SMOOTH_HZ / df))
    smoothed = np.convolve(power, np.ones(width) / width, mode="same")
    level = 10 * np.log10(smoothed + 1e-30)

    def band(lo: float, hi: float) -> np.ndarray:
        return level[int(lo / df) : max(int(hi / df), int(lo / df) + 1)]

    best_f, best_drop, best_mid = None, -np.inf, 0.0
    top = nyquist * 0.97
    for f in np.arange(SEARCH_FROM_HZ, nyquist - 2000, GRID_HZ):
        below = float(np.median(band(f - 1500, f - 200)))
        above = float(np.percentile(band(f + 200, top), 95))
        drop = below - above
        if drop > best_drop:
            best_f, best_drop, best_mid = float(f), drop, (below + above) / 2
    if best_f is None or best_drop < MIN_DROP_DB:
        return Cliff(None, round(max(best_drop, 0.0), 1))
    # The search window only locates the region; report where the level crosses halfway down.
    start = int(best_f / df)
    crossing = np.flatnonzero(level[start:] < best_mid)
    frequency = float(freqs[start + crossing[0]]) if crossing.size else best_f
    return Cliff(round(frequency, -1), round(best_drop, 1))
