"""Synthetic fixtures — generated with ffmpeg on the fly, no copyrighted audio."""

from __future__ import annotations

import functools
import os
import subprocess

import pytest

from tunewick_audio.ffmpeg import FFMPEG
from tunewick_audio.pipeline import process

DURATION = 11


def noise(rate: int, duration: float = DURATION) -> list[str]:
    return [
        "-f", "lavfi",
        "-i", f"anoisesrc=color=pink:amplitude=0.25:seed=7:sample_rate={rate}:duration={duration}",
    ]  # fmt: skip


def ffmpeg(*args: str) -> None:
    subprocess.run([FFMPEG, "-hide_banner", "-nostdin", "-v", "error", "-y", *args], check=True)


@pytest.fixture(scope="session")
def media(tmp_path_factory):
    root = tmp_path_factory.mktemp("media")

    def make(name: str, *args: str) -> str:
        path = str(root / name)
        if not os.path.exists(path):
            ffmpeg(*args, path)
        return path

    return make


@pytest.fixture(scope="session")
def processed(tmp_path_factory):
    """Runs the pipeline once per input file per test session."""
    root = tmp_path_factory.mktemp("out")

    @functools.cache
    def run(path: str) -> dict:
        return process(path, str(root / os.path.basename(path)))

    return run
