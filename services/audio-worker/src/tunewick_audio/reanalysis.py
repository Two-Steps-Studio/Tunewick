"""Backfill: best moment and waveform for uploads processed before report v2 (docs/audio.md §2.6).

Lowest priority — the worker runs it only after masters, images, clips and the sweep had their
turn. Works from the delivery variant (lossless FLAC, else AAC), since masters may be gone.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from typing import Protocol

from .moments import analyse_file

log = logging.getLogger("tunewick_audio.reanalysis")


@dataclass
class ReanalysisJob:
    id: str
    object_key: str
    codec: str


class ReanalysisQueue(Protocol):
    def claim_reanalysis(self) -> ReanalysisJob | None: ...
    def finish_reanalysis(self, upload_id: str, best_moment: dict, waveform: list[int]) -> bool: ...


class MediaStorage(Protocol):
    def download_media(self, key: str, path: str) -> None: ...


def run_reanalysis_once(queue: ReanalysisQueue, storage: MediaStorage) -> bool:
    """Re-analyses one upload. Returns False when there is nothing left to backfill."""
    job = queue.claim_reanalysis()
    if job is None:
        return False
    workdir = tempfile.mkdtemp(prefix=f"reanalysis-{job.id}-")
    try:
        path = os.path.join(workdir, "variant" + os.path.splitext(job.object_key)[1])
        storage.download_media(job.object_key, path)
        moment, waveform = analyse_file(path)
        queue.finish_reanalysis(job.id, moment.to_dict(), waveform)
        log.info(
            json.dumps({"event": "reanalysis_done", "upload": job.id, "start_ms": moment.start_ms})
        )
    except Exception:
        # Left for a later try (claims expire; three attempts at most).
        log.exception(json.dumps({"event": "reanalysis_crashed", "upload": job.id}))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return True
