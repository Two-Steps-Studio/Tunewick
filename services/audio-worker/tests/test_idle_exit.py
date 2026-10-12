import contextlib
import urllib.request

from tunewick_audio.jobs import run_forever
from tunewick_audio.wake import serve_wake


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


def test_exits_after_idle_time_and_restarts_the_count_after_work():
    clock = Clock()
    work = iter([True, False, True] + [False] * 100)
    calls = []

    def step(queue, storage):
        calls.append(clock.now)
        clock.now += 1  # a job takes a second
        return next(work)

    def backfill(queue, storage):
        return False

    run_forever(None, None, 5, 30, steps=(step,), backfill=backfill, sleep=clock.sleep, clock=clock)
    # Work at t=0 and t=7 (after one 5 s sleep); then idle polls until 30 s after the last work.
    assert clock.now >= 30 + 8
    assert clock.now < 30 + 8 + 5 + 1


def test_without_idle_exit_a_backfill_counts_as_work():
    clock = Clock()
    rounds = iter([True, True, KeyboardInterrupt])

    def backfill(queue, storage):
        value = next(rounds)
        if value is KeyboardInterrupt:
            raise SystemExit  # stop the endless loop in the test
        return value

    with contextlib.suppress(SystemExit):
        run_forever(
            None, None, 5, None, steps=(), backfill=backfill, sleep=clock.sleep, clock=clock
        )
    assert clock.now == 0  # busy backfills never sleep


def test_wake_endpoint_answers():
    server = serve_wake(0, "127.0.0.1")
    try:
        port = server.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/wake", timeout=5) as response:
            assert response.status == 200
    finally:
        server.shutdown()
