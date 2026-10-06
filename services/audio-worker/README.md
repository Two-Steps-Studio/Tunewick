# audio-worker

Python ingest pipeline for Tunewick masters: validate → analyse → loudness → tier plan →
transcode → package → verify, producing a JSON report. Specification:
[docs/audio.md](../../docs/audio.md).

Storage (R2), the job queue and fingerprinting are not wired yet (M3.2+); today the worker runs on
local files.

```bash
pnpm worker:test     # ruff + pytest inside the Docker image (Debian ffmpeg with libsoxr)
docker build -t tunewick-audio-worker services/audio-worker
docker run --rm -v "$PWD/in:/in" -v "$PWD/out:/out" tunewick-audio-worker process /in/master.wav --out /out
```

Exit code 0 = accepted, 2 = rejected (reason in `rejection.code` / `rejection.message`).
ffmpeg builds without libsoxr cannot run the pipeline — use the image.
