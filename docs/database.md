# Database

> Status: **v0.1 design for review** (Guidon: "Phase 4: Database & security design").
> Engine: PostgreSQL on Supabase (EU). The schema changes **only** through files in
> `supabase/migrations/` (reviewed, tested, applied by CI). No manual production changes.

## 1. Conventions

- `snake_case`, plural table names. Primary keys `id uuid default gen_random_uuid()` (bigint identity for high-volume append tables).
- All timestamps `timestamptz`; `created_at default now()`, `updated_at` maintained by a trigger.
- Handles/slugs: `citext`, unique, `^[a-z0-9-]{2,40}$`.
- Stable value sets are Postgres enums; sets expected to evolve are `text` + `check`.
- **Schemas:**
  - `public` — domain tables, RLS **enabled on every table** (deny by default).
  - `private` — internal tables never exposed through the Supabase Data API (audit log, ingest internals, promo code secrets, rate-limit counters). Accessed only by `security definer` functions or server-side service role.
- Every foreign key has an index. Every list query in the app has a supporting index declared in the same migration.
- Soft delete only where legally or product-wise required (`deleted_at`); otherwise hard delete with cascade.
- Polymorphic references are avoided where integrity matters; separate join tables are used instead.

## 2. Domain map

```
auth.users ─1:1─ profiles ─┬─ user_roles
                           ├─ consents, data_requests
                           ├─ artist_members ─── artists ─┬─ artist_verification_requests
                           │                              ├─ release_artists ── releases ─┬─ tracks ─┬─ track_artists
                           │                              │                               │          ├─ credits
                           │                              │                               │          ├─ audio_masters
                           │                              │                               │          └─ audio_variants
                           │                              │                               ├─ rights_declarations
                           │                              │                               └─ release_genres ── genres
                           │                              └─ event_lineup ── events ── venues ── cities
                           ├─ track_likes / release_likes / artist_follows / user_follows
                           ├─ playlists ── playlist_tracks
                           ├─ listening_events (partitioned) → listening_monthly_artist_shares
                           ├─ event_attendance ("Byłem przy tym")
                           ├─ entitlements ← promo_redemptions ← promo_codes ← promo_campaigns
                           └─ activity
graph_edges (derived)      feature_flags, access_invites, waitlist      private.audit_log
```

## 3. Tables

### 3.1 Identity and users

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= `auth.users.id`), `handle citext unique`, `display_name`, `bio`, `avatar_image_id`, `home_city_id`, `deleted_at` | **Public fields only**, readable by everyone while active. Created by trigger on signup. Reserved handles (platform names, route words, `tunewick-*`) rejected by constraint `profiles_handle_not_reserved` (`is_reserved_handle()`). ✅ implemented (M0.3, M1.3; avatar/city columns arrive with their tables). |
| `profile_settings` | `user_id`, `locale ('pl','en')`, `activity_visibility (public/followers/private)`, `age_confirmed_at` | **Private**, owner-only. Separate table because RLS is row-level, not column-level. No birth date stored (data minimization): only confirmation of minimum age (see security.md §8). ✅ implemented (M0.3). |
| `user_roles` | `user_id`, `role (moderator, admin)`, `granted_by` | Platform roles. "listener" is implicit. No writes through the Data API; changes audited. ✅ implemented (M0.3). |
| `consents` | `user_id`, `purpose (analytics, marketing, personalization)`, `granted`, `policy_version`, `created_at` | Append-only history; latest row per purpose wins. |
| `data_requests` | `user_id`, `type (export, delete)`, `status`, `requested_at`, `completed_at` | GDPR flows. |
| `blocks` | `blocker_id`, `blocked_id` | Hides users from each other's activity. |

### 3.2 Artists

> ✅ Implemented in M2.1 (`20261006060000_catalog.sql`): artists, membership with invitations (`accepted_at`) and the keep-an-owner rule, verification requests, labels, genres (22 seeded), releases, tracks, credits, release/track artists, release genres, immutable rights declarations. Membership and status changes only through functions (`create_artist`, `invite_artist_member`, `accept_artist_membership`, `remove_artist_member`, `request_artist_verification`); visibility via `release_is_public`, `can_view_release`, `can_edit_release`.

| Table | Key columns | Notes |
| --- | --- | --- |
| `artists` | `slug`, `name`, `bio`, `home_city_id`, `formed_year`, `verification_status (unverified, pending, verified, rejected)`, `verified_at`, `status (active, suspended)` | Verification shown only when `verified`. |
| `artist_members` | `artist_id`, `user_id`, `role (owner, manager, member)` | Who may act for an artist. At least one owner (enforced by trigger). |
| `artist_verification_requests` | `artist_id`, `submitted_by`, `evidence jsonb`, `status`, `reviewed_by`, `reviewed_at`, `notes` | Moderator workflow. |
| `labels` | `slug`, `name`, `home_city_id` | Small/self-run labels. |

### 3.3 Catalog

| Table | Key columns | Notes |
| --- | --- | --- |
| `releases` | `slug`, `title`, `type (single, ep, album, compilation, live)`, `label_id`, `release_date`, `publish_at`, `status`, `explicit`, `artwork_image_id`, `upc`, `p_line`, `c_line`, `territories text[]`, `ai_content (human, ai_assisted, ai_generated, unknown)` | Status flow: `draft → processing → in_review → approved → published`; also `rejected`, `taken_down`. Only `published` and `publish_at <= now()` are publicly readable. |
| `release_artists` | `release_id`, `artist_id`, `role (primary, featured)`, `position` | |
| `tracks` | `release_id`, `disc_number`, `track_number`, `title`, `isrc`, `duration_ms`, `explicit`, `ai_content`, `soundcheck_start_ms`, `soundcheck_duration_ms (≤ 30000)`, `segue_into_next bool` | `segue_into_next` marks intentional gapless transitions (live albums, mixes) — crossfade must not apply there. |
| `track_artists` | `track_id`, `artist_id`, `role (main, featured, remixer)` | |
| `credits` | `track_id`, `name`, `artist_id null`, `role (producer, songwriter, composer, lyricist, performer, mixing_engineer, mastering_engineer, other)`, `detail` | Feeds the Music Graph. |
| `genres` | `slug`, `name_pl`, `name_en`, `parent_id` | Curated list. |
| `release_genres` | `release_id`, `genre_id` | |
| `rights_declarations` | `release_id`, `declared_by`, `owns_master`, `controls_composition`, `cmo_memberships jsonb` (e.g. ZAiKS, STOART, SAWP, ZPAV or none), `samples_cleared`, `ai_content`, `terms_version`, `declared_at` | **Immutable** (no update/delete policies). A new declaration supersedes the old one. See licensing.md. |
| `images` | `owner_kind`, `storage_key`, `width`, `height`, `variants jsonb`, `dominant_color` | Artwork, avatars, venue photos. |

### 3.4 Audio

| Table | Key columns | Notes |
| --- | --- | --- |
| `audio_masters` | `track_id unique`, `storage_key`, `sha256`, `size_bytes`, `container`, `codec`, `sample_rate_hz`, `bit_depth`, `channels`, `channel_layout`, `duration_ms`, `is_lossless_codec`, `authenticity (verified_lossless, suspected_lossy_origin, suspected_upsampled, suspected_bit_padded, unknown)`, `effective_bandwidth_hz`, `effective_bit_depth`, `integrated_lufs`, `true_peak_dbtp`, `loudness_range_lu`, `clipped_samples`, `fingerprint`, `analysis jsonb`, `status` | **What the source really is.** Declared container properties and measured properties are stored separately. |
| `audio_variants` | `track_id`, `master_id`, `tier (data_saver, high, lossless, hires)`, `codec (aac_lc, flac)`, `container (fmp4, m4a, flac)`, `packaging (progressive, segmented)`, `bitrate_kbps`, `sample_rate_hz`, `bit_depth`, `channels`, `duration_ms`, `encoder_delay_samples`, `padding_samples`, `storage_key`, `size_bytes`, `sha256`, `protection (none)`, `status` | Unique on `(track_id, tier, packaging)`. **What can be delivered.** |
| `release_loudness` | `release_id`, `integrated_lufs`, `true_peak_dbtp` | Album-mode normalization. |
| `private.upload_sessions` | `release_id`, `user_id`, `object_key`, `expected_size`, `expected_sha256`, `status`, `expires_at` | Presigned upload lifecycle. |
| `private.ingest_jobs` | `upload_session_id`, `track_id`, `step`, `status`, `attempts`, `error`, `started_at`, `finished_at` | Worker state; exposed to artists through a `security definer` status function. |

**Integrity constraints (enforced in DB, not only app):**
- `tier = 'lossless'` requires `codec = 'flac'` and the master `is_lossless_codec` and `authenticity <> 'suspected_lossy_origin'`.
- `tier = 'hires'` additionally requires `(bit_depth > 16 or sample_rate_hz > 48000)`, `authenticity = 'verified_lossless'`, and variant `sample_rate_hz <= master.sample_rate_hz` and `bit_depth <= master.effective_bit_depth` (no upsampling, no padding).
- A track becomes playable only when at least the `high` variant is `ready`.

### 3.5 Moderation

| Table | Key columns | Notes |
| --- | --- | --- |
| `moderation_items` | `subject_type`, `subject_id`, `queue (release_review, artist_verification, report, takedown)`, `status`, `assigned_to`, `decision`, `statement_of_reasons`, `decided_by`, `decided_at` | Statement of reasons supports DSA obligations. |
| `reports` | `reporter_id`, `subject_type`, `subject_id`, `category`, `details`, `status` | |
| `takedown_notices` | `claimant_name`, `claimant_contact`, `subject_type`, `subject_id`, `basis`, `status`, `counter_notice`, `received_at`, `resolved_at` | Claimant data retained per legal advice. |

### 3.6 Library and listening

| Table | Key columns | Notes |
| --- | --- | --- |
| `track_likes`, `release_likes` | `user_id`, `track_id/release_id`, `created_at` | PK `(user_id, subject)`. |
| `artist_follows` | `user_id`, `artist_id`, `created_at` | |
| `user_follows` | `follower_id`, `followee_id`, `created_at` | Respects `blocks`. |
| `playlists` | `owner_id`, `title`, `description`, `visibility (public, unlisted, private)`, `cover_image_id`, `kind (manual)`, `updated_at` | `kind` leaves room for smart playlists. |
| `playlist_tracks` | `id`, `playlist_id`, `track_id`, `position double precision`, `added_by`, `added_at` | Fractional positions for cheap reorder; periodic renormalization. Duplicates allowed. |
| `listening_events` | `id bigint`, `user_id`, `track_id`, `artist_id` (denormalized primary), `variant_id`, `started_at`, `ms_played`, `completed`, `skipped`, `context_type (release, playlist, artist, discovery, event, soundcheck, search, queue)`, `context_id`, `reason_code` | **Partitioned monthly** by `started_at`. Soundcheck plays are flagged and excluded from payouts. |
| `listening_monthly_artist_shares` | `user_id`, `month`, `artist_id`, `qualified_plays`, `ms_played` | Aggregate for **user-centric payouts (D2)**: a play qualifies at ≥ 30 s (to be confirmed in payout policy). Computed monthly; kept after raw events expire. |
| `player_sessions` | `user_id`, `device_id`, `queue jsonb`, `current_index`, `position_ms`, `shuffle`, `repeat`, `updated_at` | Queue persistence and future multi-device continuity. |

### 3.7 Events and places

| Table | Key columns | Notes |
| --- | --- | --- |
| `cities` | `slug`, `name_pl`, `name_en`, `region` (voivodeship or metro area, e.g. `śląskie`, `GZM`), `country_code`, `lat`, `lng` | Seeded with Polish cities and towns (all voivodeships). |
| `venues` | `slug`, `name`, `city_id`, `address`, `lat`, `lng`, `website`, `verified` | |
| `venue_members` | `venue_id`, `user_id`, `role` | Organizers (post-MVP self-service). |
| `events` | `slug`, `title`, `venue_id`, `starts_at`, `ends_at`, `status (scheduled, cancelled, postponed)`, `ticket_url`, `description`, `source (artist, venue, admin)`, `published` | Only real, moderated events are published. |
| `event_lineup` | `event_id`, `artist_id`, `position`, `set_time` | |
| `event_attendance` | `user_id`, `event_id`, `kind (interested, attended)`, `verification (self, code)`, `visibility`, `created_at` | "Byłem przy tym" = `attended`, allowed only from `starts_at` to `starts_at + 30 days` (DB check via trigger). |

### 3.8 Graph and social

| Table | Key columns | Notes |
| --- | --- | --- |
| `graph_edges` | `src_type`, `src_id`, `dst_type`, `dst_id`, `relation`, `weight`, `derived_from`, `refreshed_at` | **Derived, not source of truth.** Rebuilt from catalog/credits/lineups/labels by a job, for fast traversal ("same producer", "played together", "same venue"). |
| `activity` | `actor_id`, `verb (liked_release, followed_artist, created_playlist, attended_event, artist_released, artist_announced_event)`, `object_type`, `object_id`, `visibility`, `created_at` | Written by triggers honoring the actor's visibility settings. No likes/comments on activity (anti-engagement-farming). |

### 3.9 Plans, entitlements and promotions

| Table | Key columns | Notes |
| --- | --- | --- |
| `plans` | `code (free, premium)`, `name`, `max_quality_tier`, `features jsonb` | Data, not code: new plans need no code changes. |
| `entitlements` | `user_id`, `plan_code`, `source (promo, beta, admin, referral, subscription)`, `source_ref`, `starts_at`, `ends_at (null = lifetime)`, `revoked_at`, `revoked_reason` | The **only** source of truth for Premium. `current_plan(user)` function returns the highest active plan. |
| `promo_campaigns` | `name`, `description`, `partner`, `source`, `starts_at`, `ends_at`, `active`, `max_redemptions_total`, `created_by` | |
| `private.promo_codes` | `campaign_id`, `code_hash` (HMAC-SHA256 with server pepper), `code_hint` (last 4 chars for admin lookup), `benefit_type (premium_days, premium_months, premium_lifetime, feature_access, percent_discount, fixed_discount)`, `benefit_value`, `benefit_feature`, `target_plan`, `starts_at`, `expires_at`, `max_uses`, `uses_count`, `per_user_limit`, `eligibility jsonb`, `active` | Codes are never stored in plaintext. Discount types are stored but not redeemable until payments exist (D3). |
| `promo_redemptions` | `code_id`, `user_id`, `entitlement_id`, `redeemed_at`, `status` | Written only by `redeem_promo_code()` (security definer, transactional). |
| `private.promo_attempts` | `user_id`, `ip_hash`, `attempted_at`, `result` | Rate limiting and fraud signals. |

### 3.10 Platform

| Table | Key columns | Notes |
| --- | --- | --- |
| `feature_flags` | `key`, `description`, `enabled`, `updated_by` | Evaluated server-side via `is_feature_enabled()`; no direct client access. `closed_beta` = on. ✅ implemented (M1.4; rollout/rules columns when needed). |
| `private.access_invites` | `code_hash` (SHA-256 of normalized code), `label`, `max_uses`, `uses_count`, `expires_at`, `revoked_at` | Closed beta gate (D5), enforced by a BEFORE INSERT trigger on `auth.users` (also covers direct Auth API calls); invite id recorded in `app_metadata`; staff bypass only via server-set `app_metadata.beta_bypass`. Codes created with `pnpm invites:create`. Separate from promo codes: access ≠ entitlement. ✅ implemented (M1.4). |
| `waitlist` | `email`, `locale`, `city_id`, `consented_at`, `invited_at` | Email only with consent; deletable. |
| `private.audit_log` | `id bigint`, `actor_id`, `actor_kind (user, system)`, `action`, `subject_type`, `subject_id`, `before jsonb`, `after jsonb`, `created_at` | Append-only, enforced by triggers even for the owner; written via `private.write_audit()` inside the same transaction as the action. ✅ implemented (M1.5). |
| `analytics_events` | `id bigint`, `user_id null`, `anon_id`, `name`, `props jsonb`, `occurred_at` | Only with analytics consent. Partitioned monthly, retention limited. |

## 4. Key database functions

| Function | Purpose |
| --- | --- |
| `current_plan(user_id)` | Highest active entitlement → plan code. |
| `can_stream_tier(user_id, track_id, tier)` | Used before issuing playback tokens: track published, territory, tier ≤ plan's `max_quality_tier`, variant ready. |
| `redeem_promo_code(code text)` | Full redemption algorithm (see promotions.md): hash → lock code row → 9 checks → insert entitlement + redemption + audit in one transaction. |
| `mark_attended(event_id)` | Time-window and visibility checks for "Byłem przy tym". |
| `is_artist_member(artist_id, roles[])` | Helper for RLS. |
| `has_app_role(role)` | Platform-role helper for RLS (not `has_role`: name collides with pgTAP). |

All `security definer` functions set `search_path = ''` and fully qualify names.

## 5. RLS policy matrix (summary)

Legend: R = read, W = insert/update, D = delete; "own" = rows where `user_id = auth.uid()`.

| Table group | Anonymous | Listener | Artist member | Moderator | Admin |
| --- | --- | --- | --- | --- | --- |
| profiles | R public fields | R public; W own | same | R all | R all; W (audited) |
| artists | R active | R active | R; W own artist (not verification fields) | R all; W verification | all |
| releases / tracks / credits | R published | R published | R own drafts; W own while `draft` | R all; W status | all |
| rights_declarations | — | — | R/W(insert) own | R | R |
| audio_masters | — | — | R own (analysis summary) | R | R |
| audio_variants | — (tokens only) | R metadata of published | R own | R | R |
| likes / follows | — | R own + public profiles' when visible; W/D own | same | R | R |
| playlists / playlist_tracks | R public | R public/unlisted by id; W/D own | same | R | R |
| listening_events | — | R/W(insert) own | R aggregated for own artist (no user ids) | — | aggregated only |
| events / venues / cities | R published | R published | W events for own artist (→ review) | W | all |
| event_attendance | — | R own + visible; W own via `mark_attended` | aggregated counts | R | R |
| entitlements | — | R own | R own | R | W via functions only |
| promo_* | — | — (function only) | — | — | via admin functions |
| moderation / reports / takedowns | — | W(insert) reports | W(insert) reports | R/W | all |
| feature_flags | — | R evaluated result only (via function) | same | R | W |
| private.* | — | — | — | — | via functions |

Every policy is covered by pgTAP tests in `supabase/tests/` (a policy without a test fails review).

## 6. Data volume and retention

| Data | Growth driver | Strategy |
| --- | --- | --- |
| `listening_events` | plays | Monthly partitions; raw events kept 25 months (proposal, confirm with legal L4); monthly aggregates kept for payouts/accounting. |
| `analytics_events` | consented interactions | Monthly partitions; 13 months. |
| `audit_log` | admin/security actions | Kept ≥ 2 years (proposal). |
| `private.promo_attempts` | redemption attempts | 90 days. |
| Account deletion | user request | Profile and personal data deleted/anonymized within 30 days; listening events detached (user_id null) where needed for payout accounting, per legal advice. |

## 7. Migration strategy

1. One migration per logical change, named `YYYYMMDDHHMMSS_<module>_<change>.sql`.
2. Migrations are forward-only; risky changes use expand → migrate → contract across releases.
3. CI applies all migrations from zero on an empty database and runs pgTAP tests.
4. `work` merges apply to staging; production apply is a gated deploy step on `main`.
5. Generated TypeScript types (`supabase gen types`) are committed with each migration.
6. Seed data (`supabase/seed.sql`) is for local development only and is clearly fake; it never reaches staging/production.

## 8. MVP feature → table coverage

| MVP feature (product.md §6) | Tables |
| --- | --- |
| Auth, profile | `auth.users`, `profiles`, `consents` |
| Artist account & verification | `artists`, `artist_members`, `artist_verification_requests` |
| Release upload, metadata, rights, AI declaration | `releases`, `tracks`, `credits`, `release_genres`, `rights_declarations`, `images`, `private.upload_sessions` |
| Validation, quality analysis | `audio_masters`, `private.ingest_jobs` |
| Moderation | `moderation_items`, `reports`, `takedown_notices` |
| Soundcheck | `tracks.soundcheck_*` |
| Player, quality selection, gapless | `audio_variants`, `release_loudness`, `tracks.segue_into_next`, `player_sessions` |
| Library, history, playlists | `track_likes`, `release_likes`, `artist_follows`, `listening_events`, `playlists`, `playlist_tracks` |
| Discovery, related | `graph_edges`, `listening_events`, `artist_follows` |
| Social | `user_follows`, `activity`, `blocks` |
| Events, "Byłem przy tym" | `cities`, `venues`, `events`, `event_lineup`, `event_attendance` |
| Music Graph | catalog + `credits` + `event_lineup` → `graph_edges` |
| Entitlements, promo codes | `plans`, `entitlements`, `promo_campaigns`, `private.promo_codes`, `promo_redemptions` |
| Admin, audit | `user_roles`, `private.audit_log`, `feature_flags` |
| Beta | `access_invites`, `waitlist` |
| GDPR | `consents`, `data_requests` |

## Master audio uploads (implemented, M3.2a)

`public.track_audio_uploads` — one row per upload attempt of a track's master; the newest row is
the track's current audio. Status `pending → uploaded → processing → accepted | rejected | failed`.
Members of the release's artist (and staff) can read rows; clients have **no** write grants:
`begin_audio_upload(track, file_name, size_bytes)` (editable release, lossless extensions,
1 KiB–4 GiB, ≤ 10 attempts per track per hour) returns the object key
`masters/<artist>/<track>/<upload>.<ext>` that the server presigns; `complete_audio_upload(upload)`
after the server has checked the object's size in storage; `abandon_audio_upload(upload, reason)`.
`processing`/`accepted`/`rejected` and the worker `report` are written only by the audio worker
(service role, M3.2b). Objects of deleted tracks stay in the ingest bucket until the cleanup job
(backlog).

## Audio processing (implemented, M3.2b)

`track_audio_uploads` gains `attempts`, `claimed_at`, `duration_ms`, `integrated_lufs`,
`true_peak_dbtp`. `public.track_audio_variants` (one row per delivered file: tier, codec,
container, rate, depth, nominal/real bitrate, samples, AAC delay/padding, object key, size,
SHA-256) is readable by members/staff, and by everyone once the release is public
(`can_view_audio_upload`, security definer because anonymous users cannot read uploads).
Service-role-only queue functions: `claim_audio_upload()` (oldest `uploaded`, or `processing`
stuck > 30 min; `FOR UPDATE SKIP LOCKED`; at most 3 attempts), `finish_audio_upload(upload,
report, variants)` (accepted → variants, duration/loudness, `tracks.duration_ms` from the audio;
rejected → code + message), `fail_audio_upload(upload)` (crash → back to the queue, failed after
the third attempt).

## Release review and publishing (implemented, M5.0)

`releases` gains `submitted_at`, `reviewed_at`, `review_note` (why it was returned; cleared on
approval). `public.release_review_events` (submitted / withdrawn / approved / returned + note) is
the history members and staff see; the moderator's identity is only in the private audit log.
Functions: `release_readiness(release)` (tracks, AI declared, rights declared, every track's newest
master accepted — the same rules as the editor checklist), `submit_release` and
`withdraw_release_submission` (members), `review_release(release, 'approve' | 'return', note)`
(moderator or admin **and** aal2; approve → `published` with `publish_at` = release date at
midnight Europe/Warsaw if in the future, else now; return → `rejected` with a ≥ 10-character note;
both audit-logged). `release_playback(release)` returns, for releases the caller may see, each
track's newest accepted master (source description) and its variants — the only way anonymous
listeners reach playback data. The web app signs URLs only for tiers within the listener's plan
(everyone is on Free = High until Premium codes exist).
