# API

> Status: **conventions v0.1.** Endpoint reference is added as endpoints are implemented
> (each implementation task updates this file).

## 1. Shape

- **Internal web UI:** Next.js Server Components for reads, **Server Actions** for mutations. Not a public API.
- **HTTP API** (`/api/v1/...` Route Handlers) only where needed: player (playback tokens, listening events), uploads, webhooks, and future native clients.
- **Database functions** (Supabase RPC) for transactional domain operations (`redeem_promo_code`, `mark_attended`, …), called from server code.

## 2. Conventions

| Topic | Rule |
| --- | --- |
| Versioning | URL prefix `/api/v1`. Breaking changes → new version. |
| Auth | Session cookie (web) or `Authorization: Bearer <access token>` (native clients later). |
| Input | JSON validated with zod schemas from `packages/shared`. Unknown fields rejected. |
| Output | JSON, `camelCase`. Timestamps ISO 8601 UTC. IDs are UUID strings. |
| Errors | `{ "error": { "code": "promo_expired", "message": "…", "requestId": "…" } }` with correct HTTP status (400/401/403/404/409/422/429/500). Messages localized client-side by `code`. |
| Pagination | Cursor-based: `?cursor=…&limit=…` → `{ items, nextCursor }`. |
| Idempotency | Mutating endpoints with side effects accept `Idempotency-Key`. |
| Rate limits | `429` with `Retry-After`. |
| Caching | Public catalog reads cacheable (`s-maxage` + revalidation); anything user-specific `private, no-store`. |

## 3. Planned endpoints (MVP)

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/playback/token` | `{ trackId, tier? }` → chosen variant + signed media URL + quality descriptor (source/delivered). Server checks entitlement and availability. |
| `POST /api/v1/playback/events` | Batched listening events (start, progress, complete, skip, error, tier switch). |
| `PUT /api/v1/player/session` | Persist queue and position. |
| `POST /api/v1/uploads` | Create upload session → presigned (multipart) upload URL to ingest bucket. |
| `POST /api/v1/uploads/{id}/complete` | Finish upload → enqueue ingest job. |
| `GET /api/v1/ingest/{releaseId}/status` | Processing/analysis status for artists. |
| `POST /api/v1/promo/redeem` | Calls `redeem_promo_code`; rate limited. |
| `POST /api/v1/webhooks/*` | Future payment provider webhooks (signature-verified). |

Media itself is served by `media.tunewick.com` (Cloudflare Worker) — see architecture.md §6.4.

## 4. Implemented endpoints (Discover, M13)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/discover/feed?mode&seed&exclude&start&artist&locale` | A page of the Discover feed (signed preview URLs; `private, no-store`). Works for visitors |
| `POST /api/discover/events` | Batched product events (≤ 50). Visitors' events are accepted and dropped |
| `POST /api/discover/share` | `{ trackId, channel }` → share points (once per song and day) |
| `POST /api/listen` | One listen (`context: player | preview`) → `{ awards, achievements }` |
| `GET /api/progress` | Today's progress for in-app celebrations (goals, streak) |
| `GET /api/cards/song/{code}?format=story|square&locale` | Share card PNG (1080×1920 / 1080×1080) |
| `GET /api/cards/week?format&locale` | The signed-in listener's weekly card |

Song pages `/song/{artist}/{title}-{code}` also serve an Open Graph image.
