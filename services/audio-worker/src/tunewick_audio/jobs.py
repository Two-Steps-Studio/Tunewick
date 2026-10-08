"""Job loop: take uploaded masters from the queue, process them, store variants, report back.

Queue and results live in Supabase (claim/finish/fail RPCs, service role only — see
supabase/migrations/20261006100000_audio_processing.sql). Masters are read from the ingest bucket
and variants written to the media bucket (S3 API: Cloudflare R2 in production, SeaweedFS locally).
"""

from __future__ import annotations

import json
import logging
import math
import os
import shutil
import tempfile
import time
from dataclasses import dataclass
from typing import Any, Protocol

from .pipeline import process

log = logging.getLogger("tunewick_audio.jobs")

CONTENT_TYPES = {".flac": "audio/flac", ".mp4": "audio/mp4", ".m4a": "audio/mp4"}


@dataclass
class Job:
    id: str
    track_id: str
    object_key: str
    attempts: int


class Queue(Protocol):
    def claim(self) -> Job | None: ...
    def finish(self, upload_id: str, report: dict, variants: list[dict]) -> str: ...
    def fail(self, upload_id: str) -> str: ...


class Storage(Protocol):
    def download_master(self, key: str, path: str) -> None: ...
    def upload_variant(self, path: str, key: str, content_type: str) -> None: ...


def finite(value: Any) -> Any:
    """JSON for Postgres: NaN/±Infinity (e.g. the true peak of silence) become null."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, list):
        return [finite(v) for v in value]
    return value


def variant_rows(job: Job, report: dict, storage: Storage) -> list[dict]:
    """Uploads every produced file and returns the rows for track_audio_variants."""
    rows = []
    for variant in report["variants"]:
        seconds = variant["samples"] / variant["sample_rate"]
        for file in variant["files"]:
            name = os.path.basename(file["path"])
            key = f"tracks/{job.track_id}/{job.id}/{name}"
            content_type = CONTENT_TYPES[os.path.splitext(name)[1]]
            storage.upload_variant(file["path"], key, content_type)
            rows.append(
                {
                    "tier": variant["tier"],
                    "codec": "aac_lc" if variant["codec"] == "aac" else "flac",
                    "container": file["container"],
                    "sample_rate": variant["sample_rate"],
                    "bit_depth": variant["bits"],
                    "nominal_kbps": variant["bitrate_kbps"],
                    "bitrate_kbps": round(file["bytes"] * 8 / seconds / 1000),
                    "samples": variant["samples"],
                    "encoder_delay_samples": variant["encoder_delay_samples"],
                    "padding_samples": variant["padding_samples"],
                    "object_key": key,
                    "bytes": file["bytes"],
                    "sha256": file["sha256"],
                }
            )
    return rows


def public_report(report: dict) -> dict:
    """The stored report: no local paths, only what describes the audio."""
    clean = json.loads(json.dumps(finite(report)))
    for variant in clean.get("variants", []):
        for file in variant.get("files", []):
            file["path"] = os.path.basename(file["path"])
    return clean


def run_once(queue: Queue, storage: Storage) -> bool:
    """Processes one job. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False
    started = time.monotonic()
    workdir = tempfile.mkdtemp(prefix=f"job-{job.id}-")
    try:
        extension = os.path.splitext(job.object_key)[1]
        master = os.path.join(workdir, f"master{extension}")
        storage.download_master(job.object_key, master)
        report = process(master, os.path.join(workdir, "out"))
        rows = variant_rows(job, report, storage) if report["status"] == "accepted" else []
        status = queue.finish(job.id, public_report(report), rows)
        log.info(
            json.dumps(
                {
                    "event": "job_done",
                    "upload": job.id,
                    "status": status,
                    "rejection": (report.get("rejection") or {}).get("code"),
                    "variants": len(rows),
                    "seconds": round(time.monotonic() - started, 2),
                }
            )
        )
    except Exception:
        log.exception(
            json.dumps({"event": "job_crashed", "upload": job.id, "attempt": job.attempts})
        )
        try:
            queue.fail(job.id)
        except Exception:
            log.exception(json.dumps({"event": "fail_report_failed", "upload": job.id}))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return True


def run_forever(queue: Queue, storage: Storage, poll_seconds: float) -> None:
    """Audio first, then images, then share clips; sleeps only when every queue is empty."""
    from .clips import run_clip_once
    from .image_jobs import run_image_once

    log.info(json.dumps({"event": "worker_started", "poll_seconds": poll_seconds}))
    while True:
        busy = False
        for step in (run_once, run_image_once, run_clip_once):
            try:
                busy = step(queue, storage) or busy  # type: ignore[arg-type]
            except Exception:
                # Queue unreachable (network, Supabase restart): wait and try again.
                log.exception(json.dumps({"event": "queue_error", "step": step.__name__}))
        if not busy:
            time.sleep(poll_seconds)
