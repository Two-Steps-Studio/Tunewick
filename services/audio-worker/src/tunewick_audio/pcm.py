"""Single streaming pass over the fully decoded master (docs/audio.md §2.2–§2.3).

The decode itself is the integrity check: any ffmpeg error rejects the upload. The same pass
computes hashes, the effective bit depth, level statistics and the averaged power spectrum used
by the authenticity checks, without holding the whole track in memory.
"""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
from dataclasses import dataclass

import numpy as np

from .ffmpeg import ffmpeg_cmd
from .probe import Rejected

CLIP_THRESHOLD = 0.9999  # ≈ −0.001 dBFS; int full scale (incl. 32767/32768) counts
CLIP_RUN = 3  # consecutive full-scale samples that count as one clipping event


def fft_size(sample_rate: int) -> int:
    """≈ 5.4–5.9 Hz resolution at every supported rate."""
    return 8192 * max(1, 2 ** int(np.log2(sample_rate // 44100)))


@dataclass
class PcmStats:
    samples: int  # per channel
    pcm_sha256: str
    flac_md5: str | None  # MD5 of the samples packed at the declared bit depth (FLAC style)
    effective_bits: int
    peak: float  # max |x|, linear (float masters may exceed 1.0)
    clipped_runs: int
    dc_offset: list[float]
    correlation: float | None
    silent: bool
    spectrum: np.ndarray  # mean power per rfft bin, summed over channels
    freqs: np.ndarray


def decode_command(path: str, sample_format: str) -> list[str]:
    raw = "f32le" if sample_format == "float" else "s32le"
    return ffmpeg_cmd("-i", path, "-map", "0:a:0", "-f", raw, "-c:a", f"pcm_{raw}", "-")


def iter_pcm(path: str, sample_format: str, sample_rate: int, channels: int):
    """Yields 1-second interleaved blocks (int32 left-justified, or float32)."""
    dtype = np.dtype("<f4") if sample_format == "float" else np.dtype("<i4")
    block = sample_rate * channels * dtype.itemsize
    with tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(
            decode_command(path, sample_format), stdout=subprocess.PIPE, stderr=errors
        )
        assert proc.stdout is not None
        try:
            while data := proc.stdout.read(block):
                if len(data) % (channels * dtype.itemsize):
                    raise Rejected("decode_error", "The audio data ends in the middle of a frame.")
                yield data, np.frombuffer(data, dtype=dtype)
        finally:
            proc.stdout.close()
            code = proc.wait()
        errors.seek(0)
        message = errors.read().decode(errors="replace").strip()
    if code != 0 or message:
        raise Rejected(
            "decode_error",
            "The file is damaged and does not decode cleanly. Export the master again.",
        )


def analyse(path: str, *, sample_format: str, sample_rate: int, channels: int, bits: int):
    n = fft_size(sample_rate)
    window = np.hanning(n)
    spectrum = np.zeros(n // 2 + 1)
    frames = 0

    sha = hashlib.sha256()
    md5 = hashlib.md5() if sample_format == "int" and bits <= 32 else None
    pack_bytes = (bits + 7) // 8
    or_bits = np.uint32(0)
    fits16 = fits24 = True  # float masters holding integer PCM
    samples = 0
    peak = 0.0
    clipped = 0
    sums = np.zeros(channels)
    cross = sq_l = sq_r = 0.0
    nonzero = False

    for data, flat in iter_pcm(path, sample_format, sample_rate, channels):
        sha.update(data)
        if sample_format == "int":
            or_bits |= np.bitwise_or.reduce(flat.view(np.uint32))
            if md5 is not None:
                packed = (flat >> (32 - bits)).astype("<i4").view(np.uint8).reshape(-1, 4)
                md5.update(packed[:, :pack_bytes].tobytes())
            x = flat.astype(np.float64) / 2**31
        else:
            x = flat.astype(np.float64)
            if fits24:
                scaled = x * 2**23
                fits24 = bool(np.all(scaled == np.round(scaled)) and np.all(np.abs(x) <= 1))
                if fits16:
                    scaled = x * 2**15
                    fits16 = fits24 and bool(np.all(scaled == np.round(scaled)))
        frame = x.reshape(-1, channels)
        samples += frame.shape[0]

        magnitude = np.abs(frame)
        peak = max(peak, float(magnitude.max(initial=0.0)))
        nonzero = nonzero or bool(magnitude.any())
        for column in (magnitude >= CLIP_THRESHOLD).T:
            if column.any():
                edges = np.diff(np.concatenate(([0], column.astype(np.int8), [0])))
                lengths = np.flatnonzero(edges == -1) - np.flatnonzero(edges == 1)
                clipped += int(np.count_nonzero(lengths >= CLIP_RUN))
        sums += frame.sum(axis=0)
        if channels == 2:
            cross += float(np.dot(frame[:, 0], frame[:, 1]))
            sq_l += float(np.dot(frame[:, 0], frame[:, 0]))
            sq_r += float(np.dot(frame[:, 1], frame[:, 1]))

        for start in range(0, frame.shape[0] - n + 1, n):
            segment = frame[start : start + n] * window[:, None]
            spectrum += (np.abs(np.fft.rfft(segment, axis=0)) ** 2).sum(axis=1)
            frames += 1

    if samples == 0:
        raise Rejected("empty", "The file contains no audio.")

    if sample_format == "int":
        # Lowest bit ever set across all samples → how many low-order bits are pure padding.
        value = int(or_bits)
        trailing_zeros = (value & -value).bit_length() - 1
        effective_bits = bits if value == 0 else min(bits, 32 - trailing_zeros)
    else:
        effective_bits = 16 if fits16 else 24 if fits24 else 32

    correlation = None
    if channels == 2 and sq_l > 0 and sq_r > 0:
        correlation = cross / float(np.sqrt(sq_l * sq_r))

    return PcmStats(
        samples=samples,
        pcm_sha256=sha.hexdigest(),
        flac_md5=md5.hexdigest() if md5 is not None else None,
        effective_bits=effective_bits,
        peak=peak,
        clipped_runs=clipped,
        dc_offset=[float(v) for v in sums / samples],
        correlation=correlation,
        silent=not nonzero,
        spectrum=spectrum / max(frames, 1),
        freqs=np.fft.rfftfreq(n, 1 / sample_rate),
    )


def decode_digest(path: str, sample_rate: int, channels: int) -> tuple[str, int]:
    """SHA-256 of the decoded PCM (s32le) and the per-channel sample count — for verification."""
    sha = hashlib.sha256()
    samples = 0
    for data, flat in iter_pcm(path, "int", sample_rate, channels):
        sha.update(data)
        samples += flat.size // channels
    return sha.hexdigest(), samples
