from __future__ import annotations

from tunewick_audio.sweep import Deletion, run_sweep_once


class FakeQueue:
    def __init__(self, items: list[Deletion]):
        self.items = items
        self.finished: list[int] = []

    def claim_deletions(self, limit):
        batch, self.items = self.items[:limit], self.items[limit:]
        return batch

    def finish_deletions(self, ids):
        self.finished.extend(ids)
        return len(ids)


class FakeStorage:
    def __init__(self, broken: set[str] = frozenset()):
        self.deleted: list[tuple[str, str]] = []
        self.broken = broken

    def delete_object(self, bucket, key):
        if key in self.broken:
            raise RuntimeError("storage unavailable")
        self.deleted.append((bucket, key))


def test_nothing_queued():
    assert run_sweep_once(FakeQueue([]), FakeStorage()) is False


def test_deletes_and_clears_only_what_was_deleted():
    queue = FakeQueue(
        [
            Deletion(1, "ingest", "clips/a/card.png"),
            Deletion(2, "media", "clips/t/a.mp4"),
            Deletion(3, "media", "clips/t/b.mp4"),
        ]
    )
    storage = FakeStorage(broken={"clips/t/b.mp4"})
    assert run_sweep_once(queue, storage) is True
    assert storage.deleted == [("ingest", "clips/a/card.png"), ("media", "clips/t/a.mp4")]
    # The failed one stays queued for the next try.
    assert queue.finished == [1, 2]
