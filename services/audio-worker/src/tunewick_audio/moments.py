"""Best moment and waveform (docs/audio.md §2.6): where a 30-second preview should start.

Computed in the same streaming pass as the integrity checks (pcm.analyse), one second at a time:
the loudness of each second and its spectral shape in log-spaced bands. A good preview is loud
relative to the rest of the track (the chorus or drop, not the intro or a breakdown) and starts
where something new begins (a section boundary: the spectral shape and energy change). It is a
suggestion — the artist's own choice (tracks.soundcheck_start_ms) always wins.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

METHOD = "energy_novelty_v1"
PREVIEW_S = 30
WAVEFORM_POINTS = 200
WAVEFORM_RATE = 10  # peaks per second before downsampling
BANDS = 16
BOUNDARY_S = 4  # seconds compared on each side of a candidate boundary
SILENCE_DB = -50.0


@dataclass
class Moment:
    start_ms: int
    duration_ms: int

    def to_dict(self) -> dict:
        return {"start_ms": self.start_ms, "duration_ms": self.duration_ms, "method": METHOD}


class MomentTracker:
    """Collects per-second features from 1-second blocks of float frames (samples × channels)."""

    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate
        # The bands end at 16 kHz: hi-res masters are analysed at every 2nd/4th sample (the
        # little energy above 22 kHz that folds back changes the band shape negligibly).
        self._decimate = max(1, sample_rate // 44100)
        rate = sample_rate // self._decimate
        edges = np.geomspace(60, min(16000, rate / 2 * 0.95), BANDS + 1)
        freqs = np.fft.rfftfreq(rate, 1 / rate)
        self._band_of = np.digitize(freqs, edges) - 1  # −1 / BANDS = outside the bands
        self._window = np.hanning(rate)
        self.energy_db: list[float] = []
        self.bands_db: list[np.ndarray] = []
        self.peaks: list[float] = []

    def add(self, frame: np.ndarray) -> None:
        mono = frame.mean(axis=1)
        step = max(1, self.sample_rate // WAVEFORM_RATE)
        for start in range(0, mono.size, step):
            self.peaks.append(float(np.abs(mono[start : start + step]).max(initial=0.0)))
        # A trailing block shorter than half a second says too little about loudness.
        if mono.size < self.sample_rate // 2:
            return
        rms = float(np.sqrt(np.mean(mono**2)))
        self.energy_db.append(20 * np.log10(max(rms, 1e-9)))
        spectral = mono[:: self._decimate]
        padded = np.zeros(self._window.size)
        padded[: min(spectral.size, padded.size)] = spectral[: padded.size]
        power = np.abs(np.fft.rfft(padded * self._window)) ** 2
        inside = (self._band_of >= 0) & (self._band_of < BANDS)
        bands = np.bincount(self._band_of[inside], weights=power[inside], minlength=BANDS)
        self.bands_db.append(10 * np.log10(bands + 1e-12))

    def waveform(self) -> list[int]:
        """WAVEFORM_POINTS peaks scaled to 0–100 (relative to the loudest moment)."""
        peaks = np.asarray(self.peaks)
        if not peaks.size or peaks.max() <= 0:
            return [0] * WAVEFORM_POINTS
        bins = np.array_split(peaks, min(WAVEFORM_POINTS, peaks.size))
        values = np.array([b.max() for b in bins]) / peaks.max()
        if values.size < WAVEFORM_POINTS:  # short tracks: repeat points, keep the peaks
            values = values[np.arange(WAVEFORM_POINTS) * values.size // WAVEFORM_POINTS]
        return [round(float(v) * 100) for v in values]

    def best_moment(self, duration_s: float) -> Moment:
        return best_moment(np.asarray(self.energy_db), np.asarray(self.bands_db), duration_s)


def _normalize(values: np.ndarray) -> np.ndarray:
    low, high = np.percentile(values, 10), np.percentile(values, 95)
    if high - low < 1e-6:
        return np.zeros_like(values)
    return np.clip((values - low) / (high - low), 0, 1)


def novelty(energy_db: np.ndarray, bands_db: np.ndarray, span: int = BOUNDARY_S) -> np.ndarray:
    """How much changes at the start of each second: spectral shape and a rise in energy."""
    seconds = energy_db.size
    result = np.zeros(seconds)
    for t in range(span, seconds - span + 1):
        before, after = bands_db[t - span : t].mean(axis=0), bands_db[t : t + span].mean(axis=0)
        shape = float(np.linalg.norm((after - after.mean()) - (before - before.mean())))
        rise = max(0.0, float(energy_db[t : t + span].mean() - energy_db[t - span : t].mean()))
        result[t] = shape / np.sqrt(BANDS) + rise
    return result


def best_moment(energy_db: np.ndarray, bands_db: np.ndarray, duration_s: float) -> Moment:
    """The start of the best PREVIEW_S window, in whole seconds."""
    length = min(PREVIEW_S, int(duration_s))
    seconds = energy_db.size
    if duration_s < PREVIEW_S + 5 or seconds < PREVIEW_S + 2 * BOUNDARY_S:
        return Moment(0, round(min(PREVIEW_S, duration_s) * 1000))

    loud = _normalize(energy_db)
    new = _normalize(novelty(energy_db, bands_db))
    silent = energy_db < SILENCE_DB
    last = seconds - length - 3  # never run into the last seconds (fade-out, a hard stop)
    scores = np.full(seconds, -np.inf)
    for start in range(1, max(last, 1) + 1):
        window = slice(start, start + length)
        score = float(loud[window].mean()) + 0.6 * float(new[start]) - float(silent[window].mean())
        # Choruses and drops sit in the middle; an intro or an outro rarely sells a song.
        position = start / seconds
        if position < 0.1 or position > 0.75:
            score -= 0.3
        scores[start] = score
    start = int(np.argmax(scores))
    # Start on the boundary itself when one is a few seconds away.
    nearby = range(max(1, start - 3), min(max(last, 1), start + 3) + 1)
    if new[start] < 0.5:
        boundary = max(nearby, key=lambda s: new[s])
        if new[boundary] >= 0.5:
            start = boundary
    return Moment(start * 1000, length * 1000)
