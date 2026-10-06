"""Spectral "cliff" detection (docs/audio.md §2.3).

Lossy encoders and upsampling both leave a brick-wall low-pass: audio content up to a frequency,
then (almost) nothing up to Nyquist. Natural roll-off of real recordings is gradual, so a steep
drop that stays down is the signal.

What sits above the cliff tells the cases apart: a lossy encoder leaves nothing there, so a decode
shows only the quantization floor of its bit depth (or, at 24 bits, a drop of 60 dB and more). A
genuine master with band-limited content still has real noise above it (room, tape, dither at a
higher level), which is not a lossy origin. This is a heuristic — results are flags, and a
moderator can override them (with an audit-log entry).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_DROP_DB = 25.0  # level difference between just below and everywhere above the cliff
EMPTY_DROP_DB = 60.0  # a drop this deep means "nothing above", whatever the bit depth
FLOOR_MARGIN_DB = 15.0  # above-cliff level within this of the quantization floor = empty
SMOOTH_HZ = 100.0
GRID_HZ = 50.0
SEARCH_FROM_HZ = 5000.0


@dataclass
class Cliff:
    frequency_hz: float | None  # None → no brick-wall cutoff below Nyquist
    drop_db: float  # strongest drop found (also reported when below the threshold)
    above_db: float | None = None  # level above the cliff, same scale as quantization_floor_db

    def empty_above(self, floor_db: float) -> bool:
        """True when the band above the cliff holds nothing but quantization noise."""
        if self.frequency_hz is None or self.above_db is None:
            return False
        return self.drop_db >= EMPTY_DROP_DB or self.above_db <= floor_db + FLOOR_MARGIN_DB


def quantization_floor_db(bits: int, channels: int, n: int) -> float:
    """Expected per-bin power of rounding noise at `bits` in our averaged Hann spectrum."""
    variance = (2.0 ** -(bits - 1)) ** 2 / 12
    return float(10 * np.log10(channels * variance * np.sum(np.hanning(n) ** 2)))


def find_cliff(power: np.ndarray, freqs: np.ndarray, sample_rate: int) -> Cliff:
    nyquist = sample_rate / 2
    df = float(freqs[1] - freqs[0])
    width = max(1, round(SMOOTH_HZ / df))
    smoothed = np.convolve(power, np.ones(width) / width, mode="same")
    level = 10 * np.log10(smoothed + 1e-30)

    def band(lo: float, hi: float) -> np.ndarray:
        return level[int(lo / df) : max(int(hi / df), int(lo / df) + 1)]

    best_f, best_drop, best_mid, best_above = None, -np.inf, 0.0, 0.0
    top = nyquist * 0.97
    for f in np.arange(SEARCH_FROM_HZ, nyquist - 2000, GRID_HZ):
        below = float(np.median(band(f - 1500, f - 200)))
        above = float(np.percentile(band(f + 200, top), 95))
        drop = below - above
        if drop > best_drop:
            best_f, best_drop, best_mid, best_above = float(f), drop, (below + above) / 2, above
    if best_f is None or best_drop < MIN_DROP_DB:
        return Cliff(None, round(max(best_drop, 0.0), 1))
    # The search window only locates the region; report where the level crosses halfway down.
    start = int(best_f / df)
    crossing = np.flatnonzero(level[start:] < best_mid)
    frequency = float(freqs[start + crossing[0]]) if crossing.size else best_f
    return Cliff(round(frequency, -1), round(best_drop, 1), round(best_above, 1))
