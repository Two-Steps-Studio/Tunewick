"""What the analysis allows us to deliver (docs/audio.md §2.3 and §3).

Labels are binding: a tier is generated only when the analysis supports it.
"""

from __future__ import annotations

from dataclasses import dataclass

LOSSY_CLIFF_HZ = (10000.0, 19500.0)  # typical MP3/AAC low-pass range
UPSAMPLE_TOLERANCE_HZ = (2500.0, 1500.0)  # below / above the original Nyquist
STANDARD_RATES = (44100, 48000, 88200, 96000, 176400)


def family_base(sample_rate: int) -> int:
    return 44100 if sample_rate % 44100 == 0 else 48000


@dataclass
class Authenticity:
    lossy_origin: bool
    upsampled_from: int | None  # original sample rate when the file looks upsampled
    effective_sample_rate: int


def classify(sample_rate: int, cliff_hz: float | None, *, empty_above: bool = True) -> Authenticity:
    """`empty_above`: nothing but quantization noise above the cliff (see spectrum.Cliff)."""
    if cliff_hz is not None and empty_above and LOSSY_CLIFF_HZ[0] <= cliff_hz < LOSSY_CLIFF_HZ[1]:
        return Authenticity(True, None, sample_rate)
    if cliff_hz is not None and empty_above and sample_rate > 48000:
        # Any lower standard rate, either family (44.1 → 96 kHz upsampling is common).
        originals = [rate for rate in STANDARD_RATES if rate < sample_rate]
        matches = [
            rate
            for rate in originals
            if max(rate / 2 - UPSAMPLE_TOLERANCE_HZ[0], LOSSY_CLIFF_HZ[1])
            <= cliff_hz
            <= rate / 2 + UPSAMPLE_TOLERANCE_HZ[1]
        ]
        if matches:
            original = min(matches, key=lambda rate: abs(rate / 2 - cliff_hz))
            return Authenticity(False, original, original)
    return Authenticity(False, None, sample_rate)


@dataclass(frozen=True)
class FlacTarget:
    bits: int
    sample_rate: int


@dataclass
class TierPlan:
    lossy_sample_rate: int
    lossless: FlacTarget | None
    hires: FlacTarget | None


def plan(sample_rate: int, effective_bits: int, authenticity: Authenticity) -> TierPlan:
    rate = authenticity.effective_sample_rate
    base = family_base(rate)
    if authenticity.lossy_origin:
        return TierPlan(base, None, None)
    lossless = FlacTarget(16, rate if rate <= 48000 else base)
    hires = None
    if effective_bits > 16 or rate > 48000:
        hires = FlacTarget(24 if effective_bits > 16 else 16, rate)
    return TierPlan(base, lossless, hires)
