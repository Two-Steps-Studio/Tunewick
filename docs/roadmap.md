# Roadmap

> Phases and milestones are tracked as tasks in Guidon (source of truth). This file is the
> overview. Detailed implementation tasks for a phase are created in Guidon when the phase
> starts, so they reflect what was learned before.

## Planning phases

| # | Phase | Status |
| - | ----- | ------ |
| 0 | Repository & workflow setup | done except `main` branch protection (owner) |
| 1 | Product audit & definition — [product.md](product.md) | direction approved; legal review open |
| 2 | Brand & design system — [design-system.md](design-system.md) | v0.1 — logo A "Wick" final assets done |
| 3 | Technical architecture — [architecture.md](architecture.md) | v0.1 — review |
| 4 | Database & security — [database.md](database.md), [security.md](security.md) | v0.1 — review |
| – | Licensing, audio, promotions, recommendations, API — [licensing.md](licensing.md), [audio.md](audio.md), [promotions.md](promotions.md), [recommendations.md](recommendations.md), [api.md](api.md) | v0.1 — review |

## Implementation milestones (MVP → closed GZM beta)

| Milestone | Master Prompt phase | Content | Depends on |
| --- | --- | --- | --- |
| **M0 Foundations** | 3 | Monorepo scaffold, CI, Supabase local + migrations + pgTAP, app shell with tokens/fonts/i18n, environments | planning docs |
| **M1 Auth & profiles** | 5 | Signup/login/logout/reset, profiles, roles, consents, age confirmation, beta invite gate | M0 |
| **M2 Catalog & artist onboarding** | 6 | Artists, membership, verification request, releases/tracks/credits/genres, rights declaration, artwork | M1 |
| **M3 Audio pipeline & streaming** | 7 | Playback spike → worker ingest (validate/analyse/loudness/fingerprint/transcode/package), R2 buckets, media edge, playback tokens | M2 |
| **M4 Player & queue** | 8 | Player engine (MSE/native strategies), queue, shuffle/repeat, volume, quality selection + indicator, gapless, normalization, crossfade, persistence | M3 |
| **M5 Library & playlists** | 9 | Likes, history, playlists CRUD/reorder/play | M4 |
| **M6 Search & discovery** | 10–11 | Search (FTS + trigram, PL unaccent), home surfaces with reasons, related artists/tracks, smart shuffle | M5 |
| **M7 Artists & Music Graph** | 12 | Artist pages/discography/follow, credits graph, `graph_edges` derivation | M2, M6 |
| **M8 Community & events** | 13 | Cities/venues/events/lineups, "Byłem przy tym", follows, activity, privacy settings | M7 |
| **M9 Entitlements & promotions** | 15 | Plans/entitlements, Premium gating of tiers, promo redemption, admin campaigns/codes/batches | M1 (can run parallel to M4+) |
| **M10 Admin & moderation** | 16 | Moderation queues, reports, takedowns, verification review, audit viewer, flags | M2 |
| **M11 Performance & observability** | 17 | Sentry, telemetry, budgets, query review, caching | ongoing |
| **M12 Closed beta readiness** | 18 | Security review/pentest, legal items closed, GDPR flows, seeding GZM artists/venues, launch checklist | all |

Payments & subscriptions (Phase 14) are **after** the closed beta (decision D3).

## Decisions log

| Date | Decision |
| --- | --- |
| 2026-10-05 | MVP content = independent artists upload and declare rights; no label catalog. |
| 2026-10-05 | Stack: Next.js + TypeScript, Supabase (EU), Vercel; media on Cloudflare R2 + Worker; Python audio worker (architecture.md). |
| 2026-10-05 | Docs, Guidon tasks, code and commits in English; owner communication in Polish. |
| 2026-10-05 | Free = full catalog in High; Premium = Lossless/Hi-Res. No listening restrictions on Free. |
| 2026-10-05 | No card payments in MVP; Premium via promo codes/beta. |
| 2026-10-05 | Artist payouts (future): user-centric. |
| 2026-10-05 | Launch: closed GZM beta (~30–50 artists, 5–10 venues), then public beta. |
| 2026-10-05 | Uploads: lossless masters only (WAV/AIFF/FLAC/ALAC); MP3/AAC/other lossy rejected (audio.md §2.1). |
| 2026-10-05 | Logo: concept A "Wick" (design-system.md §5). |
| 2026-10-05 | Branch protection on `main` and service accounts (Vercel, Supabase EU, Cloudflare R2, Fly.io, Sentry EU) approved; set up by owner. |
| 2026-10-05 | Legal review approved: ZAiKS, copyright and related rights, music licensing, liability for artist uploads, terms of service, takedown/notice policy, GDPR. |
