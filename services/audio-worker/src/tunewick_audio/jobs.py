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


def describe_error(error: BaseException) -> str:
    """One line for Admin → Processing, e.g. "ClientError: ... (AccessDenied) ...". No traceback."""
    text = " ".join(str(error).split())
    return f"{type(error).__name__}: {text}"[:500] if text else type(error).__name__


class Queue(Protocol):
    def claim(self) -> Job | None: ...
    def finish(self, upload_id: str, report: dict, variants: list[dict]) -> str: ...
    def fail(self, upload_id: str, error: str | None = None) -> str: ...


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
    except Exception as error:
        log.exception(
            json.dumps({"event": "job_crashed", "upload": job.id, "attempt": job.attempts})
        )
        try:
            queue.fail(job.id, describe_error(error))
        except Exception:
            log.exception(json.dumps({"event": "fail_report_failed", "upload": job.id}))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return True


def run_forever(
    queue: Queue,
    storage: Storage,
    poll_seconds: float,
    idle_exit: float | None = None,
    *,
    steps: tuple[Any, ...] | None = None,
    backfill: Any = None,
    sleep: Any = time.sleep,
    clock: Any = time.monotonic,
) -> None:
    """Audio, images, share clips, the storage sweep, then backfills; sleeps when all are idle.

    With `idle_exit`, returns after that many seconds without any work — on Fly.io the machine then
    stops and costs nothing until the database wakes it (supabase/migrations/*_worker_wake.sql).
    """
    if steps is None or backfill is None:
        from .clips import run_clip_once
        from .image_jobs import run_image_once
        from .reanalysis import run_reanalysis_once
        from .sweep import run_sweep_once

        steps = steps or (run_once, run_image_once, run_clip_once, run_sweep_once)
        backfill = backfill or run_reanalysis_once

    started = {"event": "worker_started", "poll_seconds": poll_seconds, "idle_exit": idle_exit}
    log.info(json.dumps(started))
    last_work = clock()
    while True:
        busy = False
        for step in steps:
            try:
                busy = step(queue, storage) or busy
            except Exception:
                # Queue unreachable (network, Supabase restart): wait and try again.
                log.exception(json.dumps({"event": "queue_error", "step": step.__name__}))
        if not busy:
            # Backfills only when nothing new is waiting.
            try:
                busy = backfill(queue, storage)
            except Exception:
                log.exception(json.dumps({"event": "queue_error", "step": backfill.__name__}))
        if busy:
            last_work = clock()
            continue
        if idle_exit is not None and clock() - last_work >= idle_exit:
            log.info(json.dumps({"event": "worker_idle_exit", "idle_seconds": idle_exit}))
            return
        sleep(poll_seconds)
