from __future__ import annotations

import json
import os

import pytest
from conftest import noise

from tunewick_audio.__main__ import main
from tunewick_audio.variants import AAC_ENCODER_DELAY, AAC_FRAME

S24 = ["-sample_fmt", "s32", "-bits_per_raw_sample", "24"]


def variants(report: dict) -> dict[str, dict]:
    return {v["tier"]: v for v in report["variants"]}


def cd_wav(media) -> str:
    return media("cd.wav", *noise(44100), "-ac", "2", "-c:a", "pcm_s16le")


# --- accepted masters ---------------------------------------------------------------------------


def test_cd_quality_wav_gets_exact_lossless_and_no_hires(media, processed):
    report = processed(cd_wav(media))
    assert report["status"] == "accepted", report["rejection"]
    analysis = report["analysis"]
    assert analysis["authenticity"] == "verified_lossless"
    assert analysis["effective_bits"] == 16
    assert analysis["spectral_cliff_hz"] is None
    assert analysis["tiers"] == {"data_saver": True, "high": True, "lossless": True, "hires": False}
    assert report["input"]["samples"] == 44100 * 11

    lossless = variants(report)["lossless"]
    assert (lossless["bits"], lossless["sample_rate"]) == (16, 44100)
    assert lossless["exact"] and not lossless["dithered"] and not lossless["resampled"]
    assert lossless["pcm_sha256"] == analysis["pcm_sha256"]
    assert [f["container"] for f in lossless["files"]] == ["flac", "fmp4"]

    # 11 s: the whole track is the preview; the waveform is always 200 points.
    assert analysis["best_moment"] == {
        "start_ms": 0,
        "duration_ms": 11_000,
        "method": "energy_novelty_v1",
    }
    assert len(analysis["waveform"]) == 200 and max(analysis["waveform"]) == 100
    assert report["version"] == 2


def test_true_hires_flac(media, processed):
    report = processed(media("hires.flac", *noise(96000), "-ac", "2", *S24, "-c:a", "flac"))
    assert report["status"] == "accepted", report["rejection"]
    assert report["analysis"]["effective_bits"] == 24
    assert report["analysis"]["upsampled_from"] is None
    tiers = variants(report)

    hires = tiers["hires"]
    assert (hires["bits"], hires["sample_rate"]) == (24, 96000)
    assert hires["exact"]
    # Above 48 kHz only plain FLAC (Firefox cannot play FLAC-in-fMP4 there — spike §9.2).
    assert [f["container"] for f in hires["files"]] == ["flac"]

    lossless = tiers["lossless"]
    assert (lossless["bits"], lossless["sample_rate"]) == (16, 48000)
    assert lossless["resampled"] and lossless["dithered"] and not lossless["exact"]

    assert tiers["high"]["sample_rate"] == 48000


def test_upsampled_file_is_not_sold_as_96k(media, processed):
    path = media(
        "upsampled.flac",
        *noise(44100),
        "-ac", "2",
        "-af", "aresample=resampler=soxr:precision=28:osr=96000",
        *S24, "-c:a", "flac",
    )  # fmt: skip
    report = processed(path)
    assert report["status"] == "accepted", report["rejection"]
    analysis = report["analysis"]
    assert "suspected_upsampled" in analysis["flags"]
    assert analysis["upsampled_from"] == 44100
    assert analysis["effective_sample_rate"] == 44100
    hires = variants(report)["hires"]
    assert (hires["bits"], hires["sample_rate"]) == (24, 44100)


def test_bit_padded_24_bit_is_treated_as_16_bit(media, processed):
    path = media(
        "padded.wav",
        *noise(44100),
        "-af", "aformat=sample_fmts=s16:channel_layouts=stereo", "-c:a", "pcm_s24le",
    )  # fmt: skip
    report = processed(path)
    assert report["status"] == "accepted", report["rejection"]
    assert report["input"]["bits"] == 24
    assert report["analysis"]["effective_bits"] == 16
    assert "suspected_bit_padded" in report["analysis"]["flags"]
    assert report["analysis"]["tiers"]["hires"] is False
    lossless = variants(report)["lossless"]
    assert lossless["exact"] and not lossless["dithered"]


def test_lossy_origin_gets_only_lossy_tiers(media, processed):
    mp3 = media("source.mp3", *noise(44100), "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k")
    report = processed(media("from-mp3.wav", "-i", mp3, "-c:a", "pcm_s16le"))
    assert report["status"] == "accepted", report["rejection"]
    analysis = report["analysis"]
    assert analysis["authenticity"] == "suspected_lossy_origin"
    assert 14000 <= analysis["spectral_cliff_hz"] <= 19500
    assert set(variants(report)) == {"data_saver", "high"}


def test_quiet_lossy_origin_is_still_caught(media, processed):
    # At −40 dBFS the cliff is shallow (≈ 35 dB) but above it there is only 16-bit rounding noise.
    quiet = [
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=color=pink:amplitude=0.01:sample_rate=44100:duration=11",
    ]
    mp3 = media("quiet.mp3", *quiet, "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k")
    report = processed(media("quiet-from-mp3.wav", "-i", mp3, "-c:a", "pcm_s16le"))
    assert report["analysis"]["authenticity"] == "suspected_lossy_origin"
    assert report["analysis"]["spectral_cliff_drop_db"] < 60


def test_band_limited_music_over_real_noise_is_not_lossy(media, processed):
    # Content only up to ~8 kHz, but real (pink) noise continues to Nyquist: a genuine master.
    tone = "0.25*sin(2*PI*(100*t+300*t*t))"
    path = media(
        "band-limited.flac",
        "-f", "lavfi", "-i", f"aevalsrc={tone}|{tone}:s=48000:d=11",
        "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.02:sample_rate=48000:duration=11",
        "-filter_complex", "[1]pan=stereo|c0=c0|c1=c0[n];[0][n]amix=inputs=2:normalize=0",
        *S24, "-c:a", "flac",
    )  # fmt: skip
    analysis = processed(path)["analysis"]
    assert analysis["authenticity"] == "verified_lossless"
    assert analysis["tiers"]["hires"] is True


def test_float_master_holding_24_bit_audio(media, processed):
    flac = media("float-src.flac", *noise(44100), "-ac", "2", *S24, "-c:a", "flac")
    report = processed(media("float.wav", "-i", flac, "-c:a", "pcm_f32le"))
    assert report["status"] == "accepted", report["rejection"]
    assert report["input"]["sample_format"] == "float"
    assert report["analysis"]["effective_bits"] == 24
    hires = variants(report)["hires"]
    assert (hires["bits"], hires["sample_rate"]) == (24, 44100)


@pytest.mark.parametrize(
    ("name", "args", "container"),
    [
        ("mono.aiff", ["-ac", "1", "-c:a", "pcm_s16be"], "aiff"),
        ("alac.m4a", ["-ac", "2", "-c:a", "alac", "-sample_fmt", "s16p"], "m4a"),
    ],
)
def test_other_lossless_containers(media, processed, name, args, container):
    report = processed(media(name, *noise(48000), *args))
    assert report["status"] == "accepted", report["rejection"]
    assert report["input"]["container"] == container
    assert variants(report)["lossless"]["exact"]


def test_aac_priming_and_padding_are_recorded(media, processed):
    report = processed(cd_wav(media))
    for tier in ("data_saver", "high"):
        aac = variants(report)[tier]
        assert aac["encoder_delay_samples"] == AAC_ENCODER_DELAY
        total = aac["encoder_delay_samples"] + aac["samples"] + aac["padding_samples"]
        assert total % AAC_FRAME == 0
        assert aac["samples"] == 44100 * 11


def test_loudness_and_level_stats(media, processed):
    sine = "0.1*sin(2*PI*997*t)"
    path = media(
        "sine.wav", "-f", "lavfi", "-i", f"aevalsrc={sine}|{sine}:s=48000:d=11", "-c:a", "pcm_s24le"
    )
    analysis = processed(path)["analysis"]
    assert analysis["loudness"]["integrated_lufs"] == pytest.approx(-20.0, abs=0.5)
    assert analysis["peak_dbfs"] == pytest.approx(-20.0, abs=0.1)
    assert analysis["stereo_correlation"] == pytest.approx(1.0, abs=1e-3)
    assert "clipping" not in analysis["flags"]


def test_clipping_is_flagged(media, processed):
    clipped = "clip(1.5*sin(2*PI*440*t)\\,-1\\,1)"
    path = media(
        "clipped.wav", "-f", "lavfi", "-i", f"aevalsrc={clipped}:s=44100:d=11", "-c:a", "pcm_s16le"
    )
    analysis = processed(path)["analysis"]
    assert "clipping" in analysis["flags"]
    assert analysis["clipped_runs"] > 100


# --- rejections ---------------------------------------------------------------------------------

SURROUND = "pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0"


@pytest.mark.parametrize(
    ("name", "args", "code"),
    [
        ("lossy.mp3", ["-c:a", "libmp3lame"], "unsupported_container"),
        ("lossy.m4a", ["-c:a", "aac"], "unsupported_codec"),
        ("surround.wav", ["-af", SURROUND, "-c:a", "pcm_s16le"], "channels"),
        ("rate.wav", ["-ar", "32000", "-c:a", "pcm_s16le"], "sample_rate"),
        ("8bit.wav", ["-c:a", "pcm_u8"], "unsupported_codec"),
    ],
)
def test_rejected_formats(media, processed, name, args, code):
    report = processed(media(name, *noise(44100), *args))
    assert report["status"] == "rejected"
    assert report["rejection"]["code"] == code
    assert report["variants"] == []


def test_too_short_is_rejected(media, processed):
    report = processed(media("short.wav", *noise(44100, 5), "-c:a", "pcm_s16le"))
    assert report["rejection"]["code"] == "duration"


def test_damaged_flac_is_rejected(media, processed, tmp_path):
    source = media("intact.flac", *noise(44100), "-ac", "2", "-c:a", "flac")
    with open(source, "rb") as handle:
        data = bytearray(handle.read())
    middle = len(data) // 2
    data[middle : middle + 4000] = bytes(4000)
    damaged = tmp_path / "damaged.flac"
    damaged.write_bytes(bytes(data))
    report = processed(str(damaged))
    assert report["status"] == "rejected"
    assert report["rejection"]["code"] in {"decode_error", "integrity"}


def test_flac_checksum_is_verified(media, processed):
    report = processed(media("intact.flac", *noise(44100), "-ac", "2", "-c:a", "flac"))
    md5 = report["analysis"]["flac_md5"]
    assert md5["stored"] is not None
    assert md5["stored"] == md5["computed"]


# --- CLI ----------------------------------------------------------------------------------------


def test_cli_writes_report_and_exit_code(media, tmp_path):
    wav = media("short.wav", *noise(44100, 5), "-c:a", "pcm_s16le")
    report_path = tmp_path / "report.json"
    code = main(["process", wav, "--out", str(tmp_path / "out"), "--report", str(report_path)])
    assert code == 2
    assert json.loads(report_path.read_text())["rejection"]["code"] == "duration"
    assert not os.path.exists(tmp_path / "out" / "high.m4a")
