"""validate → analyse → loudness → tier plan → variants → verify, producing one JSON report."""

from __future__ import annotations

import hashlib
import math
import os

from . import REPORT_VERSION
from .loudness import measure
from .pcm import analyse
from .policy import classify, plan
from .probe import MAX_DURATION_S, MIN_DURATION_S, Rejected, probe, read_flac_md5
from .spectrum import find_cliff
from .variants import Master, build

DC_OFFSET_LIMIT = 0.01  # −40 dBFS
PHASE_LIMIT = -0.3


def _sha256(path: str) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
    return sha.hexdigest()


def _dbfs(value: float) -> float | None:
    return round(20 * math.log10(value), 2) if value > 0 else None


def process(path: str, out_dir: str) -> dict:
    report: dict = {
        "version": REPORT_VERSION,
        "status": "rejected",
        "rejection": None,
        "input": {"file_sha256": _sha256(path), "bytes": os.path.getsize(path)},
        "analysis": None,
        "variants": [],
    }
    try:
        source = probe(path)
        report["input"].update(
            container=source.container,
            codec=source.codec,
            sample_rate=source.sample_rate,
            channels=source.channels,
            bits=source.bits,
            sample_format=source.sample_format,
            tags=source.tags,
        )

        stats = analyse(
            path,
            sample_format=source.sample_format,
            sample_rate=source.sample_rate,
            channels=source.channels,
            bits=source.bits,
        )
        duration = stats.samples / source.sample_rate
        report["input"].update(samples=stats.samples, duration_s=round(duration, 6))
        if not MIN_DURATION_S <= duration <= MAX_DURATION_S:
            raise Rejected("duration", "Tracks must be between 10 seconds and 4 hours long.")

        stored_md5 = read_flac_md5(path) if source.container == "flac" else None
        if stored_md5 and stored_md5 != stats.flac_md5:
            raise Rejected(
                "integrity", "The FLAC checksum does not match its audio — the file is corrupted."
            )

        cliff = find_cliff(stats.spectrum, stats.freqs, source.sample_rate)
        authenticity = classify(source.sample_rate, cliff.frequency_hz)
        loudness = measure(path)

        flags = []
        if authenticity.lossy_origin:
            flags.append("suspected_lossy_origin")
        if authenticity.upsampled_from:
            flags.append("suspected_upsampled")
        if stats.effective_bits < source.bits and source.sample_format == "int":
            flags.append("suspected_bit_padded")
        if stats.clipped_runs or loudness.true_peak_dbtp > 0:
            flags.append("clipping")
        if source.sample_format == "float" and stats.peak > 1:
            flags.append("over_full_scale")
        if any(abs(v) > DC_OFFSET_LIMIT for v in stats.dc_offset):
            flags.append("dc_offset")
        if stats.correlation is not None and stats.correlation < PHASE_LIMIT:
            flags.append("phase_inverted")
        if stats.silent:
            flags.append("digital_silence")

        tiers = plan(source.sample_rate, stats.effective_bits, authenticity)
        report["analysis"] = {
            "pcm_sha256": stats.pcm_sha256,
            "flac_md5": {"stored": stored_md5, "computed": stats.flac_md5}
            if source.container == "flac"
            else None,
            "authenticity": "suspected_lossy_origin"
            if authenticity.lossy_origin
            else "verified_lossless",
            "effective_bits": stats.effective_bits,
            "effective_sample_rate": authenticity.effective_sample_rate,
            "upsampled_from": authenticity.upsampled_from,
            "spectral_cliff_hz": cliff.frequency_hz,
            "spectral_cliff_drop_db": cliff.drop_db,
            "peak_dbfs": _dbfs(stats.peak),
            "clipped_runs": stats.clipped_runs,
            "dc_offset": [round(v, 6) for v in stats.dc_offset],
            "stereo_correlation": None
            if stats.correlation is None
            else round(stats.correlation, 4),
            "loudness": {
                "integrated_lufs": loudness.integrated_lufs,
                "range_lu": loudness.range_lu,
                "true_peak_dbtp": loudness.true_peak_dbtp,
            },
            "flags": flags,
            "tiers": {
                "data_saver": True,
                "high": True,
                "lossless": tiers.lossless is not None,
                "hires": tiers.hires is not None,
            },
        }

        master = Master(
            path=path,
            sample_rate=source.sample_rate,
            channels=source.channels,
            sample_format=source.sample_format,
            effective_bits=stats.effective_bits,
            samples=stats.samples,
            pcm_sha256=stats.pcm_sha256,
        )
        report["variants"] = [v.to_dict() for v in build(master, tiers, out_dir)]
        report["status"] = "accepted"
    except Rejected as rejection:
        report["rejection"] = {"code": rejection.code, "message": rejection.message}
    return report
