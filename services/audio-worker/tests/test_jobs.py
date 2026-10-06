from __future__ import annotations

import os
import shutil

from conftest import noise

from tunewick_audio.jobs import Job, public_report, run_once


class FakeQueue:
    def __init__(self, jobs: list[Job]):
        self.jobs = jobs
        self.finished: list[tuple[str, dict, list[dict]]] = []
        self.failed: list[str] = []

    def claim(self):
        return self.jobs.pop(0) if self.jobs else None

    def finish(self, upload_id, report, variants):
        self.finished.append((upload_id, report, variants))
        return report["status"]

    def fail(self, upload_id):
        self.failed.append(upload_id)
        return "uploaded"


class FakeStorage:
    def __init__(self, masters: dict[str, str], media_dir: str):
        self.masters = masters
        self.media_dir = media_dir
        self.uploaded: dict[str, str] = {}

    def download_master(self, key, path):
        shutil.copyfile(self.masters[key], path)

    def upload_variant(self, path, key, content_type):
        target = os.path.join(self.media_dir, key.replace("/", "_"))
        shutil.copyfile(path, target)
        self.uploaded[key] = content_type


def job(upload: str, key: str) -> Job:
    return Job(id=upload, track_id="track-1", object_key=key, attempts=1)


def test_empty_queue(tmp_path):
    assert run_once(FakeQueue([]), FakeStorage({}, str(tmp_path))) is False


def test_accepted_master_is_stored_and_reported(media, tmp_path):
    master = media("cd.wav", *noise(44100), "-ac", "2", "-c:a", "pcm_s16le")
    key = "masters/a/track-1/up-1.wav"
    queue = FakeQueue([job("up-1", key)])
    storage = FakeStorage({key: master}, str(tmp_path))

    assert run_once(queue, storage) is True
    upload_id, report, rows = queue.finished[0]
    assert upload_id == "up-1"
    assert report["status"] == "accepted"
    # high + data_saver (fMP4) + lossless (flac + fMP4); no Hi-Res for 16/44.1
    assert sorted((r["tier"], r["container"]) for r in rows) == [
        ("data_saver", "fmp4"),
        ("high", "fmp4"),
        ("lossless", "flac"),
        ("lossless", "fmp4"),
    ]
    assert all(r["object_key"].startswith("tracks/track-1/up-1/") for r in rows)
    assert storage.uploaded["tracks/track-1/up-1/high.m4a"] == "audio/mp4"
    assert storage.uploaded["tracks/track-1/up-1/lossless.flac"] == "audio/flac"
    high = next(r for r in rows if r["tier"] == "high")
    assert high["codec"] == "aac_lc" and high["nominal_kbps"] == 256
    assert high["encoder_delay_samples"] == 1024
    # The stored report carries file names, never worker-local paths.
    files = [f["path"] for v in report["variants"] for f in v["files"]]
    assert "high.m4a" in files and all("/" not in f for f in files)


def test_rejected_master_reports_reason_without_variants(media, tmp_path):
    short = media("short.wav", *noise(44100, 5), "-c:a", "pcm_s16le")
    key = "masters/a/track-1/up-2.wav"
    queue = FakeQueue([job("up-2", key)])
    storage = FakeStorage({key: short}, str(tmp_path))

    run_once(queue, storage)
    _, report, rows = queue.finished[0]
    assert report["rejection"]["code"] == "duration"
    assert rows == []
    assert storage.uploaded == {}


def test_crash_puts_the_job_back(tmp_path):
    queue = FakeQueue([job("up-3", "masters/missing.wav")])
    run_once(queue, FakeStorage({}, str(tmp_path)))  # download raises KeyError
    assert queue.failed == ["up-3"]
    assert queue.finished == []


def test_public_report_drops_infinities():
    report = {"analysis": {"loudness": {"true_peak_dbtp": float("-inf")}}, "variants": []}
    assert public_report(report)["analysis"]["loudness"]["true_peak_dbtp"] is None


class FakeImageQueue:
    def __init__(self, jobs):
        self.jobs = jobs
        self.finished: list[tuple[str, dict]] = []
        self.failed: list[str] = []

    def claim_image(self):
        return self.jobs.pop(0) if self.jobs else None

    def finish_image(self, image_id, result):
        self.finished.append((image_id, result))
        return result["status"]

    def fail_image(self, image_id):
        self.failed.append(image_id)
        return "uploaded"


def test_image_job_stores_webp_variants(tmp_path):
    from PIL import Image

    from tunewick_audio.image_jobs import ImageJob, run_image_once

    source = tmp_path / "cover.png"
    Image.new("RGB", (1500, 1500), (10, 120, 200)).save(source, "PNG")
    key = "images/release_artwork/img-1.png"
    queue = FakeImageQueue([ImageJob("img-1", "release_artwork", key, 1)])
    storage = FakeStorage({key: str(source)}, str(tmp_path))

    assert run_image_once(queue, storage) is True
    image_id, result = queue.finished[0]
    assert image_id == "img-1" and result["status"] == "accepted"
    assert [v["key"] for v in result["variants"]] == [
        f"images/img-1/{w}.webp" for w in (160, 320, 640, 1280, 1500)
    ]
    assert set(storage.uploaded.values()) == {"image/webp"}
    assert result["dominant_color"].startswith("#")


def test_image_job_rejection_uploads_nothing(tmp_path):
    from PIL import Image

    from tunewick_audio.image_jobs import ImageJob, run_image_once

    source = tmp_path / "small.jpg"
    Image.new("RGB", (500, 500)).save(source, "JPEG")
    key = "images/release_artwork/img-2.jpg"
    queue = FakeImageQueue([ImageJob("img-2", "release_artwork", key, 1)])
    storage = FakeStorage({key: str(source)}, str(tmp_path))
    run_image_once(queue, storage)
    assert queue.finished[0][1]["rejection"]["code"] == "too_small"
    assert storage.uploaded == {}
