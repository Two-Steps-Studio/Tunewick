# Roadmap

> Phases are tracked as tasks in Guidon (source of truth). This file is the high-level overview.

| # | Phase | Status |
| - | ----- | ------ |
| 0 | Repository & workflow setup | in progress (branch protection pending) |
| 1 | Product audit & definition | direction approved; legal review open |
| 2 | Brand & design system | not started |
| 3 | Technical architecture | not started |
| 4 | Database & security | not started |
| 5 | Authentication | not started |
| 6 | Music catalog | not started |
| 7 | Audio pipeline & streaming | not started |
| 8 | Player & queue | not started |
| 9 | Library & playlists | not started |
| 10 | Search & discovery | not started |
| 11 | Recommendations | not started |
| 12 | Artists & Music Graph | not started |
| 13 | Community & events | not started |
| 14 | Payments & subscriptions | not started |
| 15 | Promotions & promo codes | not started |
| 16 | Admin & moderation | not started |
| 17 | Performance & observability | not started |
| 18 | Testing, security & launch | not started |

## Decisions so far (2026-10-05)

- **MVP content source:** independent artists upload their own music and declare rights.
  Commercial label catalog is out of MVP scope.
- **Initial stack to evaluate in Phase 3:** Next.js + TypeScript, Supabase (Postgres/RLS/Auth/Storage), Vercel.
  Audio storage/CDN and transcoding worker to be decided in Phase 3/7.
- **Documentation language:** English. Code and commits in English.
- **Premium in MVP:** Free = full catalog in High (lossy); Premium = Lossless/Hi-Res. No card payments in MVP — Premium via promo codes and beta.
- **Artist payouts (future paid plans):** user-centric.
- **Launch:** closed beta in GZM (~30–50 artists, 5–10 venues), then public beta.
