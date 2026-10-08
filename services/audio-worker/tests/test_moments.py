from __future__ import annotations

import numpy as np

from tunewick_audio.moments import WAVEFORM_POINTS, MomentTracker, best_moment, novelty

RATE = 8000


def section(rng, seconds: int, level: float, bright: bool) -> list[np.ndarray]:
    """1-second stereo blocks of noise; `bright` adds energy high up (a chorus, cymbals)."""
    blocks = []
    for _ in range(seconds):
        mono = rng.standard_normal(RATE)
        # Darken: a moving average removes the highs; bright sections keep them.
        dark = np.convolve(mono, np.ones(16) / 16, mode="same")
        signal = (mono if bright else dark) * level
        blocks.append(np.stack([signal, signal], axis=1))
    return blocks


def track(*parts: tuple[int, float, bool]) -> MomentTracker:
    rng = np.random.default_rng(7)
    tracker = MomentTracker(RATE)
    for seconds, level, bright in parts:
        for block in section(rng, seconds, level, bright):
            tracker.add(block)
    return tracker


def test_finds_the_chorus_after_a_quiet_intro_and_a_verse():
    # intro 20 s, verse 30 s, chorus 30 s (from 50 s), verse 30 s, outro 10 s
    song = track(
        (20, 0.02, False), (30, 0.1, False), (30, 0.3, True), (30, 0.1, False), (10, 0.02, False)
    )
    moment = song.best_moment(120)
    assert abs(moment.start_ms - 50_000) <= 2_000
    assert moment.duration_ms == 30_000


def test_short_tracks_preview_from_the_start():
    song = track((20, 0.1, False))
    assert song.best_moment(20).to_dict() == {
        "start_ms": 0,
        "duration_ms": 20_000,
        "method": "energy_novelty_v1",
    }


def test_never_runs_into_the_end():
    # The loudest part is the last 25 s: the preview must still fit before the last seconds.
    song = track((60, 0.05, False), (25, 0.4, True))
    moment = song.best_moment(85)
    assert moment.start_ms + moment.duration_ms <= (85 - 3) * 1000


def test_novelty_peaks_at_a_section_boundary():
    energy = np.array([-30.0] * 20 + [-15.0] * 20)
    bands = np.vstack([np.full((20, 16), -40.0), np.tile(np.linspace(-20, -60, 16), (20, 1))])
    assert int(np.argmax(novelty(energy, bands))) == 20


def test_silence_is_never_the_best_moment():
    energy = np.array([-20.0] * 40 + [-90.0] * 40 + [-20.0] * 40)
    bands = np.tile(np.linspace(-20, -60, 16), (120, 1))
    moment = best_moment(energy, bands, 120)
    assert not 40_000 <= moment.start_ms < 80_000


def test_waveform_has_a_fixed_size_and_scale():
    song = track((12, 0.1, False), (3, 0.5, True))
    wave = song.waveform()
    assert len(wave) == WAVEFORM_POINTS
    assert max(wave) == 100 and min(wave) >= 0
    # The loud ending is louder than the start.
    assert np.mean(wave[-30:]) > 2 * np.mean(wave[:100])


def test_waveform_of_silence_is_flat():
    tracker = MomentTracker(RATE)
    tracker.add(np.zeros((RATE, 2)))
    assert tracker.waveform() == [0] * WAVEFORM_POINTS


def test_hires_masters_get_the_same_answer():
    rng = np.random.default_rng(3)
    hires = MomentTracker(96000)
    for seconds, level in ((40, 0.05), (30, 0.3), (40, 0.05)):
        for _ in range(seconds):
            block = rng.standard_normal(96000) * level
            hires.add(np.stack([block, block], axis=1))
    assert abs(hires.best_moment(110).start_ms - 40_000) <= 2_000
