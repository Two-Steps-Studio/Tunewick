# Architecture

> Status: **v0.1 proposal for owner approval** (Guidon: "Phase 3: Technical architecture").
> Every audio-related compromise is listed explicitly in section 6. Facts about browser codec
> support are as of 2026-10 and **must be validated by the Phase 7 playback spike** before they
> become commitments.

## 1. Summary

| Concern | Decision | Main alternative considered |
| --- | --- | --- |
| Shape | **Modular monolith** (one Next.js app with strict module boundaries) + two small services (audio worker, media edge) | Microservices — rejected: team size, operational cost |
| Web app | **Next.js (App Router) + TypeScript (strict) + React** | Remix/React Router, SvelteKit |
| Styling | **Tailwind CSS v4** fed by `design/tokens.css` (CSS variables) | CSS Modules only |
| Database / Auth | **Supabase**: Postgres (+RLS), Auth, Queues (pgmq), Cron | Self-hosted Postgres + Auth.js/Lucia |
| App hosting | **Vercel**, EU region (fra1) | Fly.io, self-hosted |
| Audio storage | **Cloudflare R2** (zero egress fees) | Supabase Storage, S3 + CloudFront |
| Audio delivery | **Cloudflare Worker** on `media.tunewick.com` validating signed tokens, serving R2 through CDN cache | R2 presigned URLs (poor cacheability), S3/CloudFront signed cookies |
| Audio processing | **Python worker in a container** (ffmpeg, libFLAC, numpy/scipy, pyloudnorm, chromaprint) on Fly.io (Warsaw/Frankfurt) | TypeScript + ffmpeg CLI only; Supabase Edge Functions (too limited for ffmpeg) |
| Jobs | **Supabase Queues (pgmq)** + idempotent job records | Redis/BullMQ, Inngest |
| Search (MVP) | **Postgres full-text + `pg_trgm` + `unaccent`** | Meilisearch/Typesense (later) |
| Music Graph (MVP) | **Relational edges in Postgres** + recursive CTEs | Neo4j (later only if justified) |
| i18n | **next-intl**, PL + EN, no hard-coded UI strings | i18next |
| Testing | **Vitest** (unit/integration), **Playwright** (E2E), **pgTAP** (RLS/DB), **pytest** (worker) | Jest, Cypress |
| Errors | **Sentry** (EU data region) | self-hosted GlitchTip |
| Product analytics | **First-party events table** in Postgres for product metrics; consent-gated | PostHog EU (later if needed) |
| Feature flags | **Flags table in Postgres** + server-side evaluation | PostHog/LaunchDarkly |
| Payments | Not in MVP (decision D3). Entitlements are provider-agnostic; Stripe evaluated in Phase 14 | — |

Data residency: all primary data in the EU (Supabase `eu-central-1`, Vercel `fra1`, R2 EU
jurisdiction bucket, Sentry EU).

## 2. System overview

```
                 ┌─────────────────────────── Browser / PWA ───────────────────────────┐
                 │  Next.js UI (RSC + client)     Player engine (MSE / native audio)   │
                 └───────┬───────────────────────────────────────┬─────────────────────┘
                         │ HTTPS (session cookie)                │ HTTPS + playback token
                         ▼                                       ▼
        ┌──────────── Vercel (fra1) ───────────┐     ┌──── Cloudflare ─────────────┐
        │ Next.js modular monolith             │     │ media-edge Worker           │
        │  - Server Components / Route Handlers│     │  - verify HMAC token        │
        │  - Server Actions                    │     │  - range requests, caching  │
        │  - issues playback tokens            │     │  - reads R2 "media" bucket  │
        │  - issues upload URLs                │     └──────────────┬──────────────┘
        └───────┬──────────────────────────────┘                    │
                │ SQL (RLS) / service role (server only)            ▼
                ▼                                        ┌──── R2 buckets ─────────┐
        ┌──── Supabase (eu-central-1) ─────────┐         │ ingest  (quarantine)    │
        │ Postgres + RLS, Auth, Queues, Cron   │◄───────►│ masters (private, never │
        └───────┬──────────────────────────────┘  jobs   │          served)        │
                │ pgmq jobs                              │ media   (delivery       │
                ▼                                        │          variants)      │
        ┌──── Audio worker (Fly.io, EU) ───────┐         └─────────────────────────┘
        │ validate → analyse → transcode →     │◄──────── reads ingest, writes
        │ loudness → fingerprint → package     │          masters + media
        └──────────────────────────────────────┘
```

## 3. Repository layout (monorepo, pnpm workspaces)

```
apps/
  web/                      Next.js app (modular monolith)
    src/app/                routes (App Router), [locale] segment for PL/EN
    src/modules/<module>/   domain modules (see 4)
    src/lib/                cross-cutting: db clients, auth helpers, i18n, telemetry
services/
  audio-worker/             Python: ingest pipeline (Dockerfile, pytest)
  media-edge/               Cloudflare Worker (TypeScript): token check + R2 delivery
packages/
  shared/                   shared TS types, zod schemas, token format, quality model
supabase/
  migrations/               versioned SQL migrations (only way to change the schema)
  tests/                    pgTAP tests (RLS policies, functions)
  seed.sql                  local development seed (clearly fake, never shown as real)
design/                     tokens and brand board
docs/                       project documentation
```

## 4. Modules (inside `apps/web`)

Each module owns its tables, server functions and UI pieces. Other modules import only from
`modules/<name>/index.ts` (enforced by ESLint boundary rules). Cross-module writes go through
the owning module's functions.

| Module | Responsibility |
| --- | --- |
| `auth` | sessions, registration, login, password reset (Supabase Auth), roles |
| `users` | profiles, privacy settings, data export/deletion requests |
| `artists` | artist accounts, verification, profiles, members |
| `catalog` | releases, tracks, credits, genres, labels, artwork |
| `ingest` | upload sessions, rights declarations, ingest job status, moderation hand-off |
| `audio` | audio assets/variants, quality model, playback token issuance |
| `player` | queue persistence, playback state, listening events |
| `library` | likes, history, playlists |
| `search` | search index views and queries |
| `discovery` | home sections, related artists/tracks, recommendation reasons |
| `events` | events, venues, cities, "Byłem przy tym" |
| `graph` | relationship edges and traversal queries |
| `social` | follows, activity |
| `entitlements` | plans, entitlements (Free/Premium/Lifetime), checks |
| `promotions` | campaigns, promo codes, redemptions |
| `moderation` | review queues, reports, takedowns |
| `admin` | admin UI, audit log viewer, configuration |
| `flags` | feature flags, beta access |
| `analytics` | consent-gated product events |

## 5. Request, auth and data access

- **Supabase Auth** (email + password, magic link optional; OAuth later). Sessions via HTTP-only cookies using `@supabase/ssr`.
- **Server-first data access.** Pages read data in Server Components; mutations in Server Actions/Route Handlers. The browser never receives the service-role key.
- **RLS on every table** exposed through the user-scoped client. Service-role access only inside server code paths that need it (ingest callbacks, admin actions), always paired with explicit authorization checks and audit logging.
- **Roles:** `listener`, `artist_member`, `moderator`, `admin` (plus per-artist membership roles). Authorization is checked server-side; UI hiding is cosmetic only.
- Rate limiting at the edge (Vercel firewall / middleware) and in Postgres for sensitive operations (promo redemption, login, uploads).

Details: [security.md](security.md), [database.md](database.md).

## 6. Audio architecture (quality-first)

Full pipeline specification: [audio.md](audio.md). Architecture-level decisions:

### 6.1 Storage tiers
1. **ingest** bucket: raw uploads, quarantined until validated. Deleted after processing.
2. **masters** bucket: the artist's original file, **bit-for-bit preserved**, never served to listeners, never re-encoded in place. Checksummed (SHA-256).
3. **media** bucket: delivery variants generated from the master.

Every variant is generated **directly from the master** (no lossy → lossy chains).

### 6.2 Delivery variants (proposed, to be validated in Phase 7)

| Tier | Codec / container | Source requirement | Notes |
| --- | --- | --- | --- |
| Data Saver | AAC-LC ~96–128 kbps, fMP4/M4A | any | universal playback incl. Safari |
| High | AAC-LC ~256 kbps, fMP4/M4A | any | universal; Opus considered but Safari does not play Opus in MP4 |
| Lossless | FLAC 16-bit / 44.1 or 48 kHz | lossless master | if master is 24-bit: dithered to 16 only for this tier |
| Hi-Res Lossless | FLAC at the master's native bit depth and sample rate (≤ 24-bit / 192 kHz) | lossless master with >16-bit or >48 kHz that passes authenticity analysis | never upsampled; never labelled Hi-Res if analysis flags it |

Exact bitrates are set after listening/ABX tests and codec licensing review (AAC encoder patent
status) in Phase 7.

### 6.3 Packaging and gapless

The player has a **delivery strategy abstraction** chosen per device by capability probing
(not by user-agent sniffing), and the server returns only variants the client can play:

- **Strategy MSE** (Chromium, Firefox, Android): fragmented MP4 (CMAF) with FLAC or AAC. Consecutive tracks are appended to the same `SourceBuffer` with `timestampOffset`, trimming AAC encoder priming via edit lists. This gives true gapless for FLAC and near-gapless for AAC.
- **Strategy Native** (Safari / iOS): progressive files via `<audio>` (Safari plays FLAC natively) with preloading of the next track. Gapless is best-effort here. If the spike confirms FLAC-in-fMP4 works in Safari MSE / ManagedMediaSource, Safari moves to Strategy MSE.
- HTTP range requests on all files; the media edge supports `Range` and caches by object + range.

**Spike results (2026-10-06, audio.md §9) → packaging decision (provisional until Safari/iOS/Android are measured):**

| Tier | Packaging | Playback |
| --- | --- | --- |
| Data Saver, High | AAC-LC in fMP4 + stored priming/padding | MSE with append-window trimming (required for gapless — untrimmed AAC drops out at boundaries) |
| Lossless (≤ 48 kHz) | FLAC in fMP4 **and** plain `.flac` | MSE (measured gapless in Chromium/Firefox); `.flac` for the native strategy |
| Hi-Res (> 48 kHz) | plain `.flac` only | native `<audio>` (FLAC-in-fMP4 > 48 kHz fails in Firefox); gapless best-effort |

Storing Lossless twice costs little on R2 (no egress, ~$0.015/GB-month). Capability probing must
decode a short sample, not trust `canPlayType`.
- **No adaptive switching inside a track for lossless.** "Auto" picks a tier at track start based on connection, device, battery and user setting, and may step down at the next track (or mid-track only on stall). The quality indicator always shows the variant actually being played.

### 6.4 Playback authorization
- The app issues a **short-lived playback token** (HMAC, ~10 min, bound to user, track variant, entitlement tier) after server-side checks: track published, territory OK, user entitled to that tier (Lossless/Hi-Res require Premium, decision D4).
- `media-edge` verifies the token, then serves from R2 with CDN caching. Tokens are refreshed by the player before expiry; an expired token during playback → silent re-issue, never a playback stop if still entitled.
- DRM: none for indie MVP (artist terms allow streaming without DRM). Architecture keeps a `protection` field per variant to add encryption (CENC/FairPlay) later for offline/label content.

### 6.5 Documented compromises (section 17 of the Master Prompt)

| # | Compromise | Why | Better solution / follow-up |
| --- | --- | --- | --- |
| C1 | **Browsers are not bit-perfect.** All browsers mix through the OS and resample to the output device rate (AudioContext/output rate, often 48 kHz). | Platform limitation; no exclusive mode in the web platform. | UI shows "output resampled by system" when track rate ≠ output rate. Native desktop app (e.g. Tauri + WASAPI exclusive / CoreAudio) for bit-perfect — future roadmap item. |
| C2 | Gapless is best-effort for Hi-Res in Firefox (FLAC-in-fMP4 > 48 kHz unsupported, measured) and for Safari until measured on real devices. | Browser codec support. | Native strategy with next-track preload; UI says "gapless unavailable on this browser" only where true. Re-test each browser release. |
| C3 | Lossless tier for 24-bit masters is dithered to 16-bit. | Bandwidth/compatibility for the Lossless tier. | Hi-Res tier delivers the native 24-bit; users can choose it. |
| C4 | Lossy tiers use AAC, not Opus. | Safari does not play Opus in MP4; one universal lossy codec simplifies gapless and storage. | Re-evaluate Opus when Safari supports it in MP4/MSE. |
| C5 | No adaptive bitrate within a lossless track. | Mid-track switching would make the quality label untrue or need constant UI changes. | Step-down only on stall; indicator updates immediately. |
| C6 | Loudness normalization applied at playback via gain metadata, not baked into files. | Preserves source. | — (this is the intended design, listed for clarity). |

### 6.6 Normalization
Integrated loudness (EBU R128 / ITU-R BS.1770) and true peak are measured at ingest per track
and per release (album mode). The player applies gain in a Web Audio `GainNode` (or element
volume where Web Audio is not used), never altering files. User can turn it off; album mode
preserves relative levels inside a release.

## 7. Background processing

- Jobs are rows in `ingest_jobs` plus a pgmq message. Worker polls the queue, processes idempotently (job id + step), writes results, and advances status. Failed steps retry with backoff; poison messages go to a dead-letter queue and surface in admin.
- Steps: validate → analyse (format, integrity, clipping, lossy-origin / fake Hi-Res detection) → loudness → fingerprint (Chromaprint) → transcode variants → package (fMP4) → verify variants (decode check, duration match) → publish to media bucket → mark ready for moderation.
- Supabase Cron for periodic tasks: expiring entitlements, cleaning ingest bucket, recomputing discovery aggregates.

## 8. Environments and deployment

| Environment | App | Database | Media |
| --- | --- | --- | --- |
| local | `next dev` | Supabase CLI (Docker) | local R2 emulation (Miniflare / MinIO) |
| preview (per PR from `work`) | Vercel preview | Supabase **staging** project | staging bucket |
| production (`main`) | Vercel production | Supabase production project | production buckets |

- Migrations: `supabase/migrations`, applied by CI to staging on merge to `work`, and to production as a gated step on merge to `main`.
- Secrets: Vercel/Supabase/Cloudflare/Fly secret stores; `.env.example` lists names only.

## 9. CI (GitHub Actions) — required checks on `main`

1. `lint` — ESLint (incl. module boundaries), Prettier check, ruff (worker)
2. `typecheck` — `tsc --noEmit` across workspaces
3. `test` — Vitest; pytest (worker); pgTAP (RLS) against Supabase CLI
4. `build` — Next.js build, worker Docker build
5. `e2e` — Playwright smoke tests against preview (required once E2E exists)
6. `migrations` — migrations apply cleanly from zero

## 10. Observability

- Sentry for frontend and server errors (EU region), with release tagging.
- Structured logs (JSON) from server and worker; correlation id per request/job.
- Playback telemetry (consent-aware, aggregated): start time, stalls, errors, delivered variant. Without consent only strictly necessary technical counters are kept.
- Admin health view: queue depth, failed jobs, ingest throughput, playback error rate.

## 11. Performance

- Server Components and streaming; client JS only for interactive parts (player is a persistent client island in the root layout so navigation never interrupts playback).
- Artwork: generated sizes (WebP/AVIF) at ingest, served from the media edge with long cache.
- Self-hosted, subset fonts.
- Postgres: indexes defined with each migration; query plans reviewed for discovery/search queries.
- Budgets: home LCP < 2.5 s on mid-range mobile 4G; time-to-first-audio < 1 s for cached High tier.
- Measured (M11): signed-in players report time to first audio (loading → playing) and player
  errors to `private.playback_metrics` — day, tier, strategy, browser family only, no user id;
  rate-limited per account by a separate hourly counter. `/admin` shows starts, median and p90
  per tier for the last 7 days and flags a median over 1 s.
- Query review (M11.5): `scripts/db/query-review.sql` fills the local database with ~10x the
  closed beta (3 000 artists, 12 000 releases, 60 000 tracks, 400 venues, 4 000 gigs, 20 000
  listeners, 1M listens) inside a rolled-back transaction and times the hot read paths as an
  anonymous visitor. Run it after schema changes to discovery, search, graph or Scene.

  | Path | Before | After |
  | --- | --- | --- |
  | `search_catalog` (typo, worst case: synthetic titles share trigrams) | 7 191 ms | 99 ms |
  | `discover_releases` (all of Poland) | 891 ms | 13 ms |
  | `discover_artists` | 993 ms | 5 ms |
  | `related_artists`, `upcoming_events`, artist releases and gigs | 1–8 ms | unchanged |
  | `refresh_artist_graph` (full recompute) | 13 ms | 10 ms |

  Cause: security-invoker functions read every catalog row through RLS, where the release and
  track policies call `can_view_release()` per row; search filtered with `similarity()`, which no
  index serves. Catalog-wide read functions are now security definer with explicit public filters
  (published, `publish_at <= now()`, artist active), and search filters each source by its
  trigram-indexed expression. Foreign keys read by hot paths or cascades got indexes; audit-only
  columns (`created_by`, `reviewed_by`, …) stay unindexed on purpose — they are only touched when
  an account is deleted.
- Page budget (M11.6): `pnpm --filter @tunewick/web perf:budget` loads key pages from a running
  production build in Chromium emulating a mid-range phone on 4G (Pixel 7 viewport, 4x CPU
  slowdown, 9 Mb/s, 150 ms RTT, cold cache) and fails over LCP 2.5 s or 250 kB of compressed JS.
  First run (local server, so without real network distance to Vercel and Supabase):

  | Page | LCP | JS (compressed) |
  | --- | --- | --- |
  | `/` | 840 ms | 166 kB |
  | `/scena` | 664 ms | 165 kB |
  | `/szukaj` | 596 ms | 166 kB |
  | `/logowanie` | 700 ms | 162 kB |
  | `/biblioteka` | 704 ms | 169 kB |

  Most of the JS is the React/Next runtime and the persistent player shared by every page. Repeat
  against the production URL after deploy for numbers that include real latency.

## 12. Cost estimate (order of magnitude, closed beta)

Assumptions: 50 artists, ~2,000 tracks, average 4 min; masters mostly 24/48–24/96; 1,000 beta
listeners, 1 h/day.

| Item | Estimate |
| --- | --- |
| Masters storage (avg ~60 MB/track) | ~120 GB |
| Variants (FLAC 16 ~25 MB, Hi-Res ~60 MB when present, AAC ~12 MB) | ~150 GB |
| R2 storage (~270 GB × $0.015) | ~$4 / month |
| Egress (R2 → internet) | $0 (R2 has no egress fees); Workers requests within paid plan ~$5/month |
| Supabase Pro | ~$25 / month (+ compute add-on if needed) |
| Vercel Pro | ~$20 / user / month |
| Fly.io worker (on-demand machine) | ~$5–20 / month |
| Sentry | free → Team tier |

Lossless egress is the main reason media does **not** go through Vercel or Supabase Storage:
1,000 users × 1 h/day of lossless (~60 MB/h) ≈ 1.8 TB/month, which would cost hundreds of
dollars per month on per-GB egress pricing and is $0 on R2.

## 13. Future-proofing hooks (not built in MVP)

- `audio_variants.protection` for DRM/offline; entitlement checks already server-side.
- Spatial/Atmos: variant model allows channel layouts > 2 and new codecs.
- Multi-device: queue and playback position stored server-side per user/session.
- Native apps: API (Route Handlers) and playback token model work for non-browser clients.
- Search engine swap: `search` module isolates queries.

## 14. Open items → Guidon

| Item | Task |
| --- | --- |
| Playback spike: device/browser matrix for FLAC (16/24-bit, 44.1–192 kHz), fMP4/MSE, gapless, Safari/iOS | Phase 7 spike task |
| AAC encoder choice and patent/licensing check | Phase 7 |
| Monorepo scaffold + CI + Vercel/Supabase/Cloudflare projects | Phase 3 follow-up "Scaffold & CI" |
| Account setup: Vercel, Supabase (EU), Cloudflare (R2 EU), Fly.io, Sentry (EU) | owner |
