from __future__ import annotations

import os
import shutil
import subprocess

import pytest
from conftest import ffmpeg, noise

from tunewick_audio.clips import BAR_BOTTOM, BAR_HEIGHT, BAR_MARGIN, ClipJob, run_clip_once
from tunewick_audio.ffmpeg import FFMPEG, ffprobe


@pytest.fixture(scope="module")
def inputs(tmp_path_factory):
    root = tmp_path_factory.mktemp("clip-inputs")
    card = str(root / "card.png")
    audio = str(root / "high.m4a")
    ffmpeg("-f", "lavfi", "-i", "color=c=0x171515:s=1080x1920", "-frames:v", "1", card)
    ffmpeg(*noise(44100, 40), "-ac", "2", "-c:a", "aac", "-b:a", "256k", audio)
    return card, audio


def pixel(video: str, at: float, x: int, y: int) -> tuple[int, int, int]:
    raw = subprocess.run(
        [FFMPEG, "-v", "error", "-ss", str(at), "-i", video, "-frames:v", "1",
         "-vf", f"format=rgb24,crop=1:1:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout  # fmt: skip
    return raw[0], raw[1], raw[2]


class FakeQueue:
    def __init__(self, jobs):
        self.jobs = jobs
        self.finished: list[tuple[str, str | None, int | None]] = []
        self.failed: list[str] = []

    def claim_clip(self):
        return self.jobs.pop(0) if self.jobs else None

    def finish_clip(self, clip_id, object_key, size):
        self.finished.append((clip_id, object_key, size))
        return "ready" if object_key else "failed"

    def fail_clip(self, clip_id):
        self.failed.append(clip_id)
        return "queued"


class FakeStorage:
    def __init__(self, card: str, audio: str, out_dir: str):
        self.card, self.audio, self.out_dir = card, audio, out_dir
        self.uploaded: dict[str, tuple[str, str]] = {}

    def download_master(self, key, path):
        assert key == "clips/clip-1/card.png"
        shutil.copyfile(self.card, path)

    def download_media(self, key, path):
        assert key == "tracks/t/u/high.m4a"
        shutil.copyfile(self.audio, path)

    def upload_variant(self, path, key, content_type):
        target = os.path.join(self.out_dir, os.path.basename(key))
        shutil.copyfile(path, target)
        self.uploaded[key] = (target, content_type)


def job(audio_key: str | None = "tracks/t/u/high.m4a") -> ClipJob:
    return ClipJob("clip-1", "track-1", "clips/clip-1/card.png", audio_key, 12_000, 10_000, 1)


def test_renders_a_vertical_clip_with_the_preview_and_a_progress_bar(inputs, tmp_path):
    card, audio = inputs
    queue, storage = FakeQueue([job()]), FakeStorage(card, audio, str(tmp_path))

    assert run_clip_once(queue, storage) is True
    assert queue.finished[0][:2] == ("clip-1", "clips/track-1/clip-1.mp4")
    video, content_type = storage.uploaded["clips/track-1/clip-1.mp4"]
    assert content_type == "video/mp4"
    assert queue.finished[0][2] == os.path.getsize(video)

    info = ffprobe(video)
    streams = {s["codec_type"]: s for s in info["streams"]}
    assert (
        streams["video"]["codec_name"],
        streams["video"]["width"],
        streams["video"]["height"],
    ) == (
        "h264",
        1080,
        1920,
    )
    assert streams["video"]["pix_fmt"] == "yuv420p"
    assert streams["audio"]["codec_name"] == "aac"
    assert abs(float(info["format"]["duration"]) - 10) < 0.2

    # The bar fills from the left: near its right end it is lime only at the end of the clip.
    y = 1920 - BAR_BOTTOM - BAR_HEIGHT // 2
    x = 1080 - BAR_MARGIN - 20
    early, late = pixel(video, 1, x, y), pixel(video, 9.9, x, y)
    assert early[1] < 120  # graphite track
    assert late[0] > 150 and late[1] > 200  # lime fill


def test_no_audio_fails_the_clip_for_good(inputs, tmp_path):
    card, audio = inputs
    queue = FakeQueue([job(audio_key=None)])
    assert run_clip_once(queue, FakeStorage(card, audio, str(tmp_path))) is True
    assert queue.finished == [("clip-1", None, None)]


def test_a_crash_goes_back_to_the_queue(inputs, tmp_path):
    card, _ = inputs
    broken = tmp_path / "broken.m4a"
    broken.write_bytes(b"not audio")
    queue = FakeQueue([job()])
    assert run_clip_once(queue, FakeStorage(card, str(broken), str(tmp_path))) is True
    assert queue.failed == ["clip-1"] and not queue.finished


def test_empty_queue(tmp_path):
    assert run_clip_once(FakeQueue([]), FakeStorage("", "", str(tmp_path))) is False
