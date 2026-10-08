from __future__ import annotations

import shutil

from conftest import noise

from tunewick_audio.moments import WAVEFORM_POINTS
from tunewick_audio.reanalysis import ReanalysisJob, run_reanalysis_once


class FakeQueue:
    def __init__(self, jobs):
        self.jobs = jobs
        self.finished: list[tuple[str, dict, list[int]]] = []

    def claim_reanalysis(self):
        return self.jobs.pop(0) if self.jobs else None

    def finish_reanalysis(self, upload_id, best_moment, waveform):
        self.finished.append((upload_id, best_moment, waveform))
        return True


class FakeStorage:
    def __init__(self, files: dict[str, str]):
        self.files = files

    def download_media(self, key, path):
        shutil.copyfile(self.files[key], path)


def test_nothing_to_backfill():
    assert run_reanalysis_once(FakeQueue([]), FakeStorage({})) is False


def test_backfills_from_the_lossless_variant(media):
    flac = media("variant.flac", *noise(48000, 50), "-ac", "2", "-c:a", "flac")
    queue = FakeQueue([ReanalysisJob("up-1", "tracks/t/u/lossless.flac", "flac")])
    assert run_reanalysis_once(queue, FakeStorage({"tracks/t/u/lossless.flac": flac})) is True
    upload, moment, waveform = queue.finished[0]
    assert upload == "up-1"
    assert moment["duration_ms"] == 30_000 and moment["method"] == "energy_novelty_v1"
    assert 0 <= moment["start_ms"] <= 50_000 - 30_000
    assert len(waveform) == WAVEFORM_POINTS


def test_backfills_from_aac_too(media):
    aac = media("variant.m4a", *noise(44100, 20), "-ac", "2", "-c:a", "aac")
    queue = FakeQueue([ReanalysisJob("up-2", "tracks/t/u/high.m4a", "aac_lc")])
    assert run_reanalysis_once(queue, FakeStorage({"tracks/t/u/high.m4a": aac})) is True
    # Under 35 s: the whole track from the start.
    assert queue.finished[0][1]["start_ms"] == 0


def test_a_broken_file_is_left_for_later(tmp_path):
    broken = tmp_path / "broken.flac"
    broken.write_bytes(b"not audio")
    queue = FakeQueue([ReanalysisJob("up-3", "k.flac", "flac")])
    assert run_reanalysis_once(queue, FakeStorage({"k.flac": str(broken)})) is True
    assert queue.finished == []
