"""Share clips: a 9:16 share card + the preview audio → MP4 for Stories, Reels, TikTok, Shorts.

The app renders the card (PNG, 1080×1920) into the ingest bucket; the audio is cut from the track's
'high' AAC variant. A thin lime bar along the bottom fills up while the preview plays. H.264 (still
image tuning, 30 fps) + AAC 192 kb/s with short fades, `faststart` so it plays while downloading.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from typing import Protocol

from .ffmpeg import run_ffmpeg
from .jobs import Storage

log = logging.getLogger("tunewick_audio.clips")

WIDTH, HEIGHT = 1080, 1920
BAR_MARGIN, BAR_HEIGHT, BAR_BOTTOM = 96, 10, 48
TRACK_COLOR, BAR_COLOR = "0x3a3535", "0xd8ff3e"  # graphite raised, lime (design-system.md)


@dataclass
class ClipJob:
    id: str
    track_id: str
    card_key: str
    audio_key: str | None
    start_ms: int
    duration_ms: int
    attempts: int


class ClipQueue(Protocol):
    def claim_clip(self) -> ClipJob | None: ...
    def finish_clip(self, clip_id: str, object_key: str | None, size: int | None) -> str: ...
    def fail_clip(self, clip_id: str) -> str: ...


class ClipStorage(Storage, Protocol):
    def download_media(self, key: str, path: str) -> None: ...


def clip_args(card: str, audio: str, start_ms: int, duration_ms: int, out: str) -> list[str]:
    seconds = duration_ms / 1000
    width = WIDTH - 2 * BAR_MARGIN
    fade_out = max(seconds - 1, 0)
    graph = ";".join(
        [
            f"[0:v]scale={WIDTH}:{HEIGHT},setsar=1,format=yuv420p[card]",
            f"color=c={TRACK_COLOR}:s={width}x{BAR_HEIGHT}:r=30[track]",
            f"color=c={BAR_COLOR}:s={width}x{BAR_HEIGHT}:r=30[fill]",
            # The fill slides in from the left; the track clips what is outside it.
            f"[track][fill]overlay=x='-{width}+{width}*t/{seconds}':eval=frame[bar]",
            f"[card][bar]overlay=x={BAR_MARGIN}:y={HEIGHT - BAR_BOTTOM - BAR_HEIGHT},"
            "format=yuv420p[v]",
            f"[1:a]afade=t=in:d=0.4,afade=t=out:st={fade_out}:d=1[a]",
        ]
    )
    return [
        "-loop", "1", "-framerate", "30", "-i", card,
        "-ss", f"{start_ms / 1000:.3f}", "-t", f"{seconds:.3f}", "-i", audio,
        "-filter_complex", graph,
        "-map", "[v]", "-map", "[a]", "-t", f"{seconds:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        out,
    ]  # fmt: skip


def render_clip(card: str, audio: str, start_ms: int, duration_ms: int, out: str) -> int:
    """Renders the clip; returns its size in bytes."""
    run_ffmpeg(clip_args(card, audio, start_ms, duration_ms, out))
    return os.path.getsize(out)


def run_clip_once(queue: ClipQueue, storage: ClipStorage) -> bool:
    """Renders one queued clip. Returns False when the queue was empty."""
    job = queue.claim_clip()
    if job is None:
        return False
    if job.audio_key is None:
        # No processed audio (e.g. replaced and not processed yet): nothing to cut a clip from.
        queue.finish_clip(job.id, None, None)
        log.info(json.dumps({"event": "clip_no_audio", "clip": job.id}))
        return True
    workdir = tempfile.mkdtemp(prefix=f"clip-{job.id}-")
    try:
        card = os.path.join(workdir, "card.png")
        audio = os.path.join(workdir, "audio" + os.path.splitext(job.audio_key)[1])
        out = os.path.join(workdir, "clip.mp4")
        storage.download_master(job.card_key, card)
        storage.download_media(job.audio_key, audio)
        size = render_clip(card, audio, job.start_ms, job.duration_ms, out)
        key = f"clips/{job.track_id}/{job.id}.mp4"
        storage.upload_variant(out, key, "video/mp4")
        status = queue.finish_clip(job.id, key, size)
        log.info(
            json.dumps({"event": "clip_done", "clip": job.id, "status": status, "bytes": size})
        )
    except Exception:
        log.exception(
            json.dumps({"event": "clip_crashed", "clip": job.id, "attempt": job.attempts})
        )
        try:
            queue.fail_clip(job.id)
        except Exception:
            log.exception(json.dumps({"event": "fail_report_failed", "clip": job.id}))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return True
