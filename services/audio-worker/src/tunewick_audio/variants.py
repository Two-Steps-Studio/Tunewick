"""Delivery variants, packaging and verification (docs/audio.md §3–§4, spike results §9.2).

Every variant is made directly from the master. FLAC tiers ship as plain `.flac` (progressive /
native playback, the only format that plays > 48 kHz in Firefox) and, at ≤ 48 kHz, also as
FLAC-in-fMP4 for gapless MSE playback. Lossy tiers are AAC-LC in fMP4; the container does not
keep the encoder delay, so priming and padding are measured and stored for the player to trim.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import asdict, dataclass, field

from .ffmpeg import FfmpegError, ffprobe, run_ffmpeg
from .pcm import decode_digest
from .policy import FlacTarget, TierPlan

# ffmpeg's native AAC encoder always primes with one frame. The fMP4 muxer drops this value
# (ffprobe reports initial_padding=0), hence the constant.
AAC_FRAME = 1024
AAC_ENCODER_DELAY = 1024
AAC_TIERS = (("data_saver", 96), ("high", 256))
FMP4 = ["-movflags", "+empty_moov+default_base_moof", "-frag_duration", "2000000"]
MAX_FMP4_FLAC_RATE = 48000
RESAMPLE = "aresample=resampler=soxr:precision=28"


class VerificationError(RuntimeError):
    """A produced file does not match what was intended. Never publish it."""


@dataclass
class OutputFile:
    container: str  # "flac" | "fmp4"
    path: str
    bytes: int
    sha256: str


@dataclass
class Variant:
    tier: str
    codec: str
    sample_rate: int
    bits: int | None
    bitrate_kbps: int | None
    channels: int
    samples: int  # playable samples per channel (after trimming priming/padding)
    resampled: bool
    dithered: bool
    exact: bool  # decoded PCM is bit-identical to the master
    pcm_sha256: str | None
    encoder_delay_samples: int = 0
    padding_samples: int = 0
    files: list[OutputFile] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Master:
    path: str
    sample_rate: int
    channels: int
    sample_format: str
    effective_bits: int
    samples: int
    pcm_sha256: str


def _file(path: str, container: str) -> OutputFile:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
    return OutputFile(container, path, os.path.getsize(path), sha.hexdigest())


def _expected_samples(master: Master, rate: int) -> int:
    return round(master.samples * rate / master.sample_rate)


def _stream(path: str, *extra: str) -> dict:
    return next(s for s in ffprobe(path, *extra)["streams"] if s.get("codec_type") == "audio")


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def _flac(master: Master, tier: str, target: FlacTarget, out_dir: str) -> Variant:
    resampled = target.sample_rate != master.sample_rate
    # TPDF dither whenever precision is lost on the way to 16 bits. 24-bit targets are
    # truncated from 32-bit intermediates (error at −144 dBFS, below any converter's floor).
    dithered = target.bits == 16 and (resampled or master.effective_bits > 16)
    osf = "s16" if target.bits == 16 else "s32"
    dither = "triangular" if dithered else "none"
    flac_path = os.path.join(out_dir, f"{tier}.flac")
    run_ffmpeg(
        [
            "-i", master.path, "-map", "0:a:0", "-map_metadata", "-1",
            "-af", f"{RESAMPLE}:osr={target.sample_rate}:osf={osf}:dither_method={dither}",
            "-c:a", "flac", "-compression_level", "8",
            "-sample_fmt", osf, "-bits_per_raw_sample", str(target.bits),
            flac_path,
        ]
    )  # fmt: skip
    files = [_file(flac_path, "flac")]
    if target.sample_rate <= MAX_FMP4_FLAC_RATE:
        mp4_path = os.path.join(out_dir, f"{tier}.mp4")
        remux = ["-i", flac_path, "-map", "0:a:0", "-c", "copy", "-strict", "-2"]
        run_ffmpeg([*remux, *FMP4, "-f", "mp4", mp4_path])
        files.append(_file(mp4_path, "fmp4"))

    # Verification: format as intended, clean decode, identical audio in every container.
    digests = []
    for output in files:
        stream = _stream(output.path)
        _check(stream["codec_name"] == "flac", f"{output.path}: codec {stream['codec_name']}")
        _check(int(stream["sample_rate"]) == target.sample_rate, f"{output.path}: sample rate")
        _check(int(stream["channels"]) == master.channels, f"{output.path}: channels")
        _check(int(stream.get("bits_per_raw_sample") or 0) == target.bits, f"{output.path}: bits")
        digests.append(decode_digest(output.path, target.sample_rate, master.channels))
    _check(len(set(digests)) == 1, f"{tier}: containers decode to different audio")
    pcm_sha256, samples = digests[0]

    expected = _expected_samples(master, target.sample_rate)
    tolerance = 0 if not resampled else target.sample_rate // 1000
    _check(abs(samples - expected) <= tolerance, f"{tier}: {samples} samples, expected {expected}")

    exact_possible = (
        master.sample_format == "int"
        and not resampled
        and not dithered
        and master.effective_bits <= target.bits
    )
    if exact_possible:
        _check(pcm_sha256 == master.pcm_sha256, f"{tier}: audio differs from the master")

    return Variant(
        tier=tier,
        codec="flac",
        sample_rate=target.sample_rate,
        bits=target.bits,
        bitrate_kbps=None,
        channels=master.channels,
        samples=samples,
        resampled=resampled,
        dithered=dithered,
        exact=exact_possible,
        pcm_sha256=pcm_sha256,
        files=files,
    )


def _aac(master: Master, tier: str, kbps: int, rate: int, out_dir: str) -> Variant:
    path = os.path.join(out_dir, f"{tier}.m4a")
    resampled = rate != master.sample_rate
    run_ffmpeg(
        [
            "-i", master.path, "-map", "0:a:0", "-map_metadata", "-1",
            "-af", f"{RESAMPLE}:osr={rate}",
            "-c:a", "aac", "-b:a", f"{kbps}k", *FMP4, "-f", "mp4", path,
        ]
    )  # fmt: skip
    stream = _stream(path, "-count_packets")
    _check(stream["codec_name"] == "aac", f"{path}: codec {stream['codec_name']}")
    _check(int(stream["sample_rate"]) == rate, f"{path}: sample rate")
    _check(int(stream["channels"]) == master.channels, f"{path}: channels")
    packets = int(stream["nb_read_packets"])
    _, decoded = decode_digest(path, rate, master.channels)
    _check(decoded == packets * AAC_FRAME, f"{path}: decoded {decoded} of {packets} frames")

    samples = _expected_samples(master, rate)
    padding = decoded - AAC_ENCODER_DELAY - samples
    _check(0 <= padding < 2 * AAC_FRAME, f"{path}: implausible padding {padding}")

    return Variant(
        tier=tier,
        codec="aac",
        sample_rate=rate,
        bits=None,
        bitrate_kbps=kbps,
        channels=master.channels,
        samples=samples,
        resampled=resampled,
        dithered=False,
        exact=False,
        pcm_sha256=None,
        encoder_delay_samples=AAC_ENCODER_DELAY,
        padding_samples=padding,
        files=[_file(path, "fmp4")],
    )


def build(master: Master, tiers: TierPlan, out_dir: str) -> list[Variant]:
    os.makedirs(out_dir, exist_ok=True)
    variants = [
        _aac(master, tier, kbps, tiers.lossy_sample_rate, out_dir) for tier, kbps in AAC_TIERS
    ]
    if tiers.lossless:
        variants.append(_flac(master, "lossless", tiers.lossless, out_dir))
    if tiers.hires:
        variants.append(_flac(master, "hires", tiers.hires, out_dir))
    return variants


__all__ = ["FfmpegError", "Master", "Variant", "VerificationError", "build"]
