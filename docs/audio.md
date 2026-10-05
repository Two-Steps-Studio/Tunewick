# Audio

> Status: **v0.1 specification.** Codec support and bitrates marked 🔬 must be validated by the
> **playback spike** (§9) before implementation tasks treat them as facts.
> Rule zero: **never reduce quality unnecessarily, never claim a quality that isn't delivered.**

## 1. Quality vocabulary

| Term | Meaning |
| --- | --- |
| **Source** | The artist's uploaded master, stored bit-for-bit. |
| **Measured source** | What analysis shows the source really contains (effective bandwidth, effective bit depth, lossy origin). |
| **Variant** | A file derived from the master for delivery. |
| **Delivered** | The variant actually being played right now. |
| **Output** | What the device/OS does after decoding (e.g. resampling to 48 kHz). |

The UI may show a property only if it is true at the level shown (source vs delivered vs output).

## 2. Ingest pipeline

```
Upload (ingest bucket) → Validate → Analyse → Loudness → Fingerprint/duplicates
  → Store master (masters bucket) → Transcode variants → Package → Verify → Moderation → Publish
```

### 2.1 Accepted uploads
- Lossless only for full tracks: **WAV/BWF (PCM), AIFF, FLAC, ALAC**. 16/24/32-bit (32-bit float accepted and converted only for variants), 44.1–192 kHz, mono or stereo (multichannel later).
- Lossy uploads (MP3/AAC/Ogg) are **rejected** for releases in MVP — Tunewick's quality promise depends on lossless masters. **Decided by owner 2026-10-05.** If this is ever relaxed (e.g. archival material), such tracks may only be offered as "High", never "Lossless".
- Artwork: JPEG/PNG ≥ 3000×3000 recommended, ≥ 1400×1400 required.

### 2.2 Validation (reject with a clear reason)
- Decodes fully without errors (ffmpeg full decode, not just probe).
- Duration 10 s – 4 h; matches across channels; no zero-length.
- Sample rate in the allowed set; bit depth valid; channels 1–2.
- File integrity: SHA-256 recorded; FLAC MD5 verified when present.
- Metadata sanity: embedded tags are read but **the form metadata wins**; mismatches flagged.

### 2.3 Analysis (store results, flag; don't silently "fix")
| Check | Method (initial) | Effect |
| --- | --- | --- |
| Lossy origin in lossless container | Spectral analysis: hard low-pass cutoff (e.g. ~16/19/20 kHz shelves) and codec-typical holes in the spectrum over time | `authenticity = suspected_lossy_origin` → no Lossless/Hi-Res tiers; artist notified to upload the real master |
| Fake Hi-Res (upsampled) | Effective bandwidth vs Nyquist: no content above the original rate's Nyquist (e.g. nothing above 22.05 kHz in a 96 kHz file) | `suspected_upsampled` → Hi-Res tier not generated; Lossless still offered |
| Bit padding (16-bit in 24-bit container) | Low-order bits always zero / effective bit depth analysis | `suspected_bit_padded` → treated as 16-bit |
| Clipping | Consecutive full-scale samples count, true-peak > 0 dBTP | Flag shown to artist; not blocked |
| Silence / DC offset / phase issues | Basic stats (astats) | Flag |
| Loudness | EBU R128 integrated loudness, loudness range, true peak (per track, per release) | Stored for normalization |
| Fingerprint | Chromaprint per track | Duplicate/re-upload detection (§6) |

Analysis is advisory for flags and **binding for quality labels**: a tier label never exceeds what
analysis verifies. False positives can be overridden only by a moderator after review, with an
audit-log entry.

## 3. Delivery tiers

| Tier | Variant 🔬 | Generated when | Plan |
| --- | --- | --- | --- |
| Data Saver | AAC-LC ~96 kbps, 44.1/48 kHz, M4A/fMP4 | always | Free + Premium |
| High | AAC-LC ~256 kbps, 44.1/48 kHz, M4A/fMP4 | always | Free + Premium |
| Lossless | FLAC 16-bit at the master's rate if ≤ 48 kHz; else 16-bit at 44.1/48 kHz family-matched (88.2→44.1, 96→48) | master is verified lossless | Premium |
| Hi-Res Lossless | FLAC at the master's native depth/rate (≤ 24-bit/192 kHz) | master > 16-bit or > 48 kHz **and** `verified_lossless`, not upsampled/padded | Premium |

Rules:
- Every variant is made **directly from the master** (no generation loss chains).
- Resampling (only where needed for Lossless/lossy tiers): high-quality SoX resampler (`soxr`, precision ≥ 28 bit); integer-ratio family preserved.
- Bit-depth reduction 24→16: TPDF dither.
- No normalization, limiting or EQ baked into any variant.
- AAC encoder and exact bitrates decided after ABX listening tests and the codec licensing check 🔬.

## 4. Packaging and playback

- **Strategy MSE** (Chromium, Firefox, Android) 🔬: fMP4 (CMAF) per track; FLAC or AAC in MP4. Next track appended to the same `SourceBuffer` (gapless). AAC priming/padding trimmed using stored `encoder_delay_samples`/`padding_samples`.
- **Strategy Native** (Safari/iOS) 🔬: progressive `.flac` / `.m4a` in `<audio>`, next-track preload, best-effort gapless (documented compromise C2 in architecture.md).
- Strategy chosen by capability probing (`MediaSource.isTypeSupported`, `canPlayType`) **plus** a known-broken list maintained from the spike (Safari historically reported FLAC-in-MP4 MSE support but played silence).
- Range requests everywhere; first audio target < 1 s for cached High tier.

### 4.1 Auto quality
Auto selects a tier at track start from: user setting/cap, plan entitlement, network type and measured throughput, Save-Data hint, battery saver (where exposed), and variant availability. It may step down at the next track, and mid-track only on a stall. It never steps up mid-track. The indicator reflects every change.

### 4.2 Gapless and crossfade
- Gapless is the default for consecutive tracks of the same release and for `segue_into_next` tracks.
- Crossfade: user setting (off by default, 1–12 s). **Disabled automatically** between tracks of the same release when `segue_into_next` is true or when the user's "album continuity" setting is on.
- Implementation via Web Audio gain automation on the MSE pipeline; Native strategy: crossfade best-effort.

### 4.3 Normalization
- Off/On (default On, target −14 LUFS proposal 🔬), modes: Track / Album (auto Album when playing a release in order).
- Gain = target − integrated loudness, limited so that true peak stays ≤ −1 dBTP (no limiter; gain is reduced instead).
- Applied in the player (`GainNode`), never in files.

## 5. Quality indicator rules

The player shows **Source → Delivered** and, where detectable, **Output**:

| Situation | Display example |
| --- | --- |
| Hi-Res delivered as-is | `Source FLAC 24/96 → Delivered FLAC 24/96` (lime) |
| Browser/device output differs | `… → Delivered FLAC 24/96 · Output 48 kHz (system)` |
| Lossless tier of a 24/96 master | `Source FLAC 24/96 → Delivered FLAC 16/48 · Lossless` |
| Lossy tier | `Source FLAC 16/44.1 → Delivered AAC 256 kbps · High` |
| Plan limits tier | `… → Delivered AAC 256 · High — Lossless with Premium` (plain text, no dark pattern) |
| Suspected lossy origin | Source shown as `WAV 16/44.1 (lossy origin suspected)`; no Lossless label anywhere |

Words used: "Lossless" only for FLAC delivered from a verified lossless master; "Hi-Res" only for
delivered > 16-bit or > 48 kHz from a verified master. Never "bit-perfect" in the browser.
Screen readers get the same information in words.

## 6. Duplicates and fingerprinting

- Exact duplicates: SHA-256 of decoded PCM (not the file) → same audio in a different container is caught.
- Near duplicates: Chromaprint fingerprint comparison against the catalog → moderation flag "possible re-upload of …".
- Metadata collisions: same ISRC, same artist+title+duration ±2 s.
- External matching (AcoustID/third-party content ID) evaluated later 🔬.

## 7. Output devices and future bit-perfect

- Web: `setSinkId()` output selection where supported (Chromium); otherwise system default.
- Web cannot do exclusive mode or sample-rate switching; documented (compromise C1).
- Future native desktop app: WASAPI exclusive (Windows), CoreAudio hog mode + sample-rate switching (macOS), ALSA direct (Linux) for bit-perfect output; the same variants and tokens are used.
- Spatial/Atmos and offline: see architecture.md §13.

## 8. Telemetry (consent-aware)

Time to first audio, stalls (count/duration), tier switches with reason, decode errors per
strategy/browser, delivered tier distribution. Used for engineering, not marketing.

## 9. Playback spike (Phase 7, first task)

Goal: replace 🔬 assumptions with measured facts.

| Test | Matrix |
| --- | --- |
| FLAC progressive playback (16/44.1, 24/48, 24/96, 24/192) | Chrome, Edge, Firefox (Win/macOS/Android), Safari macOS, Safari iOS 17/18/26 |
| FLAC-in-fMP4 via MSE / ManagedMediaSource | same |
| AAC-in-fMP4 gapless with priming trim | same |
| Gapless test album (continuous sine sweep across track boundary; detect gap/click) | same |
| Output sample rate detection (`AudioContext.sampleRate`, `setSinkId`) | same |
| Memory/CPU for 24/192 decode on mid-range Android | Android Chrome |

Deliverable: a support matrix in this document and decisions on packaging and Safari strategy.
