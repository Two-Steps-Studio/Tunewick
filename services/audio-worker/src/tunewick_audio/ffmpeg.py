"""Thin wrappers around the ffmpeg / ffprobe executables."""

from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Sequence

FFMPEG = os.environ.get("TUNEWICK_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("TUNEWICK_FFPROBE", "ffprobe")


class FfmpegError(RuntimeError):
    """ffmpeg exited with an error or reported one on stderr."""


def ffmpeg_cmd(*args: str, level: str = "error") -> list[str]:
    return [FFMPEG, "-hide_banner", "-nostdin", "-nostats", "-v", level, "-y", *args]


def run_ffmpeg(args: Sequence[str], *, level: str = "error") -> str:
    """Runs ffmpeg; any output at `error` level counts as a failure. Returns stderr."""
    proc = subprocess.run(ffmpeg_cmd(*args, level=level), capture_output=True, text=True)
    if proc.returncode != 0 or (level == "error" and proc.stderr.strip()):
        raise FfmpegError(proc.stderr.strip() or f"ffmpeg exited with {proc.returncode}")
    return proc.stderr


def ffprobe(path: str, *extra: str) -> dict:
    proc = subprocess.run(
        [FFPROBE, "-v", "error", "-of", "json", "-show_streams", "-show_format", *extra, path],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise FfmpegError(proc.stderr.strip() or "ffprobe failed")
    return json.loads(proc.stdout)
