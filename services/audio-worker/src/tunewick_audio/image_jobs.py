"""Image job loop: take uploaded artwork/photos from the queue, re-encode, store, report back."""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from typing import Protocol

from .images import process_image
from .jobs import Storage

log = logging.getLogger("tunewick_audio.image_jobs")


@dataclass
class ImageJob:
    id: str
    kind: str
    object_key: str
    attempts: int


class ImageQueue(Protocol):
    def claim_image(self) -> ImageJob | None: ...
    def finish_image(self, image_id: str, result: dict) -> str: ...
    def fail_image(self, image_id: str) -> str: ...


def run_image_once(queue: ImageQueue, storage: Storage) -> bool:
    """Processes one image job. Returns False when the queue was empty."""
    job = queue.claim_image()
    if job is None:
        return False
    workdir = tempfile.mkdtemp(prefix=f"image-{job.id}-")
    try:
        source = os.path.join(workdir, "source" + os.path.splitext(job.object_key)[1])
        storage.download_master(job.object_key, source)
        report = process_image(source, job.kind, os.path.join(workdir, "out"))
        result = {
            "status": report["status"],
            "rejection": report["rejection"],
            "width": report.get("width"),
            "height": report.get("height"),
            "dominant_color": report.get("dominant_color"),
            "variants": [],
        }
        for variant in report["variants"]:
            key = f"images/{job.id}/{variant['width']}.webp"
            storage.upload_variant(variant["path"], key, "image/webp")
            result["variants"].append(
                {"width": variant["width"], "key": key, "bytes": variant["bytes"]}
            )
        status = queue.finish_image(job.id, result)
        log.info(
            json.dumps(
                {
                    "event": "image_done",
                    "image": job.id,
                    "status": status,
                    "rejection": (report["rejection"] or {}).get("code"),
                    "variants": len(result["variants"]),
                }
            )
        )
    except Exception:
        log.exception(json.dumps({"event": "image_crashed", "image": job.id}))
        try:
            queue.fail_image(job.id)
        except Exception:
            log.exception(json.dumps({"event": "fail_report_failed", "image": job.id}))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return True
