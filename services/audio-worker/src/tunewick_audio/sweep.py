"""Storage sweep: delete objects the database no longer refers to (private.storage_deletions).

The database queues an object when it forgets it (e.g. an expired share clip); the worker deletes
it from the bucket — a missing object counts as deleted — and then clears the queue entry. Entries
that keep failing stay queued (five tries) for someone to look at.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger("tunewick_audio.sweep")

BATCH = 100


@dataclass
class Deletion:
    id: int
    bucket: str  # "ingest" | "media"
    object_key: str


class SweepQueue(Protocol):
    def claim_deletions(self, limit: int) -> list[Deletion]: ...
    def finish_deletions(self, ids: list[int]) -> int: ...


class SweepStorage(Protocol):
    def delete_object(self, bucket: str, key: str) -> None: ...


def run_sweep_once(queue: SweepQueue, storage: SweepStorage) -> bool:
    """Deletes one batch. Returns False when nothing was queued."""
    batch = queue.claim_deletions(BATCH)
    if not batch:
        return False
    done: list[int] = []
    for item in batch:
        try:
            storage.delete_object(item.bucket, item.object_key)
            done.append(item.id)
        except Exception:
            log.exception(
                json.dumps(
                    {"event": "delete_failed", "bucket": item.bucket, "key": item.object_key}
                )
            )
    if done:
        queue.finish_deletions(done)
    log.info(
        json.dumps({"event": "sweep_done", "deleted": len(done), "failed": len(batch) - len(done)})
    )
    return True
