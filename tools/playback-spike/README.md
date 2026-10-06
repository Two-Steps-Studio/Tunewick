# Playback spike (M3.0)

Measures what browsers really do with FLAC (16/44.1 … 24/192), FLAC/AAC in fragmented MP4 (MSE)
and gapless playback. Synthetic test signal only — no copyrighted audio.

```bash
node tools/playback-spike/generate.mjs        # test media → tools/playback-spike/media (git-ignored)
cd tools/playback-spike
pnpm exec playwright test -c playwright.config.ts   # Chromium, Firefox, WebKit → results-*.json
```

Manual testing on real devices (Safari macOS/iOS, Chrome Android): serve this folder
(`npx serve tools/playback-spike`) or open the published test page, press **Start tests**, copy
the JSON from the page. Results and conclusions: [docs/audio.md §9](../../docs/audio.md).
