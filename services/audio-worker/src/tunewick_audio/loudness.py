"""EBU R128 loudness via ffmpeg's ebur128 filter (integrated, range, true peak)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .ffmpeg import run_ffmpeg


@dataclass
class Loudness:
    integrated_lufs: float
    range_lu: float
    true_peak_dbtp: float


def _value(summary: str, label: str) -> float:
    match = re.search(rf"{label}:\s+(-?inf|-?[\d.]+)", summary)
    if not match:
        raise ValueError(f"ebur128 summary is missing {label}")
    return float(match.group(1))


def measure(path: str) -> Loudness:
    scan = "ebur128=peak=true:framelog=verbose"
    stderr = run_ffmpeg(["-i", path, "-map", "0:a:0", "-af", scan, "-f", "null", "-"], level="info")
    summary = stderr[stderr.rfind("Summary:") :]
    true_peak = summary[summary.find("True peak:") :]
    return Loudness(
        integrated_lufs=_value(summary, "I"),
        range_lu=_value(summary, "LRA"),
        true_peak_dbtp=_value(true_peak, "Peak"),
    )
