import numpy as np

from tunewick_audio.policy import Authenticity, classify, plan
from tunewick_audio.spectrum import find_cliff


def synthetic(rate: int, cutoff: float | None, floor_db: float = -140.0):
    freqs = np.fft.rfftfreq(8192, 1 / rate)
    power = 1 / np.maximum(freqs, 20)  # pink-ish
    if cutoff is not None:
        power = np.where(freqs > cutoff, power[1] * 10 ** (floor_db / 10), power)
    return power, freqs


def test_full_band_has_no_cliff():
    power, freqs = synthetic(44100, None)
    assert find_cliff(power, freqs, 44100).frequency_hz is None


def test_lowpass_at_16k_is_found():
    power, freqs = synthetic(44100, 16000)
    cliff = find_cliff(power, freqs, 44100)
    assert abs(cliff.frequency_hz - 16000) <= 300
    assert classify(44100, cliff.frequency_hz).lossy_origin


def test_upsampled_detection_by_original_nyquist():
    assert classify(96000, 21800).upsampled_from == 44100
    assert classify(96000, 23500).upsampled_from == 48000
    assert classify(192000, 47000).upsampled_from == 96000
    assert classify(96000, None).upsampled_from is None
    # A 48 kHz file with an ADC filter at 21.5 kHz is normal, not a lossy origin.
    assert classify(48000, 21500) == Authenticity(False, None, 48000)


def test_tier_plan():
    tiers = plan(96000, 24, Authenticity(False, None, 96000))
    assert (tiers.hires.bits, tiers.hires.sample_rate) == (24, 96000)
    assert (tiers.lossless.bits, tiers.lossless.sample_rate) == (16, 48000)
    assert tiers.lossy_sample_rate == 48000

    cd = plan(44100, 16, Authenticity(False, None, 44100))
    assert cd.hires is None
    assert cd.lossless.sample_rate == 44100

    lossy = plan(44100, 16, Authenticity(True, None, 44100))
    assert lossy.lossless is None
    assert lossy.hires is None
