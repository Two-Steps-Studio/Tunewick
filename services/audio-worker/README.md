# audio-worker

Python ingest pipeline for Tunewick masters: validate → analyse → loudness → tier plan →
transcode → package → verify, producing a JSON report. Specification:
[docs/audio.md](../../docs/audio.md).

`python -m tunewick_audio worker` polls three Supabase queues — masters, images and share
videos (`clips.py`: story card + preview → MP4) — with files in S3/R2 (`pnpm worker:start`
locally). Fingerprinting is not wired yet.

```bash
pnpm worker:test     # ruff + pytest inside the Docker image (Debian ffmpeg with libsoxr)
docker build -t tunewick-audio-worker services/audio-worker
docker run --rm -v "$PWD/in:/in" -v "$PWD/out:/out" tunewick-audio-worker process /in/master.wav --out /out
```

Exit code 0 = accepted, 2 = rejected (reason in `rejection.code` / `rejection.message`).
ffmpeg builds without libsoxr cannot run the pipeline — use the image.
