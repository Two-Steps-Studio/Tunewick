# Discovery expansion — international, feed-first, discovery progress

> Status: **v1 plan + P0 implementation** (2026-10-07). Owner brief: "TuneWick — International
> Music Discovery, TikTok-Style Discovery & Engagement Expansion". This file is the plan; the
> tasks below mirror the Guidon tasks (Guidon stays the source of truth — the tasks must be
> created there under milestone **M13 Discovery expansion** before review).

One sentence: **"I wasn't looking for this song. Tunewick showed it to me."** Everything below
serves _discover more good music_, not _spend more time in the app_.

## 1. Audit — what exists and is reused

| Area | Exists (M0–M9) | Reused for |
| --- | --- | --- |
| Catalog | `artists`, `releases`, `tracks`, `genres`, `release_genres`, rights declarations, release review, `taken_down` status | Feed candidates, genres for diversity, rights model unchanged (§9) |
| Soundcheck | `tracks.soundcheck_start_ms` / `soundcheck_duration_ms` (5–30 s, chosen by the artist) | **The preview window.** Fallback when unset: a window from ~⅓ into the track |
| Audio | Worker variants (AAC 96/256 fMP4, FLAC), presigned GETs, `release_playback` | Previews use one AAC variant (Data Saver on slow/save-data networks), native `<audio>`, no MSE |
| Player | `PlayerEngine` (gapless MSE, quality tiers), `ListeningTracker` → `record_listen` | Full plays from the feed hand over to it; the feed pauses it while previewing |
| Library | `track_likes`, `release_likes`, `artist_follows`, `LibraryButton` | Like / Follow in the feed |
| Listening | `listening_events` (partitioned, private, clearable) | Stats, streaks, discoveries; previews are recorded there too (`context = 'preview'`) |
| Discover home | `discover_releases` / `discover_artists` grid with Polish voivodeship filter | Kept as **Browse** (`/browse`); generalized to countries |
| i18n | next-intl, `pl` + `en`, localized pathnames, all UI text in `messages/*.json` | All new UI. Country and language names come from `Intl.DisplayNames` — no lists of names to translate, every future locale works |
| Moderation | release review queue, staff roles, audit log | Reports land in the same staff area |

What made the product Poland-only: `artists.voivodeship` as the only location, the discover
filter, copy ("from all of Poland"), `profile_settings.locale` limited by a check, Polish/English
genre name columns. None of it is removed; it is generalized.

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| X1 | `/` becomes the **Discover feed**; the former grid moves to `/browse` | Discover is the center; zero clicks to new music |
| X2 | Countries are ISO 3166-1 alpha-2 codes in `public.countries` (with a macro-region for regional rankings); names are rendered with `Intl.DisplayNames` | Global without translating 250 names per locale |
| X3 | Voivodeship stays as Poland's optional region; new `artists.region` is free text for everyone else | No data loss, no Poland-specific schema for new countries |
| X4 | **Like** = existing `track_likes` (signal + Library "Liked"); **Save** = new `track_saves`, the listener's "Saved from Discover" crate | The brief scores them differently (save rate, +2 points); a crate to come back to is a different intent than a heart |
| X5 | Recommendation = SQL **candidate generation + features**, TypeScript **scoring/mixing** (`@tunewick/shared/discovery`) with weights in one config object | Easy to test, explain (reason codes) and replace with a learned model later |
| X6 | Discovery progress is a **ledger** (`discovery_points`) with an idempotency key per award; every derived number (score, streak, goals, records, rankings) is computed from it | One source of truth, anti-abuse by construction, recomputable |
| X7 | Points are awarded only by the database (`record_listen`, `save`, `share`) after server checks; the client only displays what came back | Rankings cannot be forged from the browser |
| X8 | Rankings rank **discovery points** (new songs/artists/genres/countries, saves, full listens of new music) — never listening time | Brief §20 |
| X9 | Rankings show only listeners who chose a public handle and did not opt out (`listener_preferences.show_in_rankings`) | Privacy over growth |
| X10 | Anonymous visitors get the feed and previews (cold start from a cookie with country/genres); nothing they do is stored server-side | No account before preview; no tracking without an account |
| X11 | Share URL: `/song/{artist-slug}/{title-slug}-{code}` with a random `tracks.public_code`; the title part is cosmetic and redirects to canonical | Stable, readable, no guessable ids |
| X12 | Analytics events go to `private.product_events` (no IP, no user agent, signed-in only, 180-day retention) | Improve discovery, collect nothing personal beyond the account id |

## 3. Work breakdown

### P0 — core experience (this change)

| Task | Content |
| --- | --- |
| X-DB1 Global data model | `countries`; artists `country_code`, `region`, `languages`, `artist_genres`, `artist_links`; more global genres; `listener_preferences` (language, country, genres, discovery mode, exploration share, ranking opt-out, time zone); `tracks.public_code`; locale check opened to any `xx` code |
| X-DB2 Discovery ledger | `listening_events.context`, `record_listen` → returns awards; `discovery_points` + `discovery_point_rules` (configurable values and daily caps); `track_saves`; `record_share`; anti-abuse rules (§5) |
| X-DB3 Stats & progress | `my_discovery_stats`, `my_discovery_days` (streaks), `my_records`, goals progress, weekly/monthly/all-time leaderboard (global, country, macro-region) |
| X-DB4 Feed | `discover_candidates` (features per track: genres, artist, country, languages, freshness, popularity, completion/skip/save rates, rising growth, co-follow affinity), `my_taste` (affinities from likes/saves/follows/listens/skips + preferences), `track_previews` (preview window + AAC variant keys) |
| X-REC Scoring | `rankFeed()` — weighted score, 75/25 personalization/exploration (configurable), diversity re-rank (no artist twice in 4, ≤ 40 % one genre), reason codes, mode presets (For You, Global, Nearby, New, Rising) |
| X-FEED Discover feed UI | Full-screen vertical snap feed, autoplay preview after the first tap, preload next / unload previous, keyboard + swipe, cover, title, artist, country, genre, reason, Play/Pause, Like, Save, Follow, Share, artist link, "Play full track" |
| X-ONB Onboarding | One screen: language, country, genres, a few artists (follow), what to discover; under a minute; skippable |
| X-SHARE Sharing | Public song page (artwork, artist, preview, CTA) with Open Graph image; Web Share API / copy link; share award |
| X-STATS You page | Discovery Score, level, points, streak, daily/weekly goals (adaptive), listening stats (week/month/all), personal records |
| X-RANK Weekly ranking | Weekly/monthly/all-time, global and by country/region, "your position" |
| X-I18N | All new text in `en` + `pl`; nothing Poland-specific in new code paths |
| X-NAV | Navigation: Discover · Browse · Search · Library · You |

### P1 — engagement (partly in this change, marked ✅)

- ✅ Achievements (definitions in one table, evaluated in the database), ✅ Discovery Levels,
  ✅ regional/global rankings, ✅ Weekly Recap with percentile, ✅ shareable stats card (vertical
  1080×1920 + square), ✅ artist country/genres/languages/links + similar artists + "Discover this
  artist", ✅ reports (song/artist/user) into the staff area.
- ✅ Improved recommendations: co-listening (similar listeners) next to co-follow; ✅ per-listener
  weight tuning from discovery success (`my_feed_outcomes` + `tuneWeights`).
- QR code on share cards, artist-chosen preview editing UI in the release editor (the column
  exists), upcoming events on artist pages (needs M8 events).

### P2 — advanced

~~Friends comparison~~ (done), learned recommendation model and audio embeddings, automatic
"best moment" detection in the worker (energy/novelty curve) and waveform, ~~seasonal rankings and
challenges~~ (done 2026-10-08), creator tools and promotional clips (video render of
the share card + preview audio), bot detection beyond rate rules (timing entropy, device
fingerprints — only with legal review), personalized discovery campaigns.

## 4. Recommendation (X5)

```
score = w.genre·genreAffinity + w.artist·artistAffinity + w.user·coFollowAffinity
      + w.completion·completionRate + w.replay·replayRate + w.save·saveRate
      + w.fresh·freshness + w.pop·popularity + w.region·regionalRelevance
      + w.language·languageMatch + w.rising·growth − w.skip·skipRate − w.seen·alreadyHeard
```

All inputs are normalized to 0..1 in SQL or `features()`. Weights per mode live in
`DISCOVERY_MODES` (`packages/shared/src/discovery/config.ts`). The feed is filled slot by slot:
with probability `explorationShare` (default 0.25, user-adjustable 0.1–0.4) a slot takes the
best **exploration** candidate (genre/country the listener has not heard, low popularity
preferred), otherwise the best **personalized** one; diversity rules apply to both. Each item
keeps the reason code of its strongest signal ("Because you follow X", "Rising in Germany", "New
genre for you"). Cold start (no history): preferences + global/regional popularity + freshness +
seeded random exploration.

## 5. Points, score and anti-abuse (X6–X8)

| Award | Points | Key (once per) | Daily cap |
| --- | --- | --- | --- |
| New song (≥ 15 s heard of a track never heard before) | 1 | track | 150 |
| New artist | 3 | artist | 90 |
| New genre | 5 | genre | 25 |
| New country | 5 | country | 25 |
| Save | 2 | track (unsave/resave never pays twice) | 40 |
| Full listen of a song discovered in the last 30 days | 1 | track + day | 30 |
| Share | 3 | track + day | 15 |

Values and caps are rows in `discovery_point_rules` (staff-editable, no deploy). Further rules:
listening time is capped by real time (`record_listen` already refuses more ms than the track and
120 events/min); at most 6 new-song awards per rolling minute (faster is not listening); skips
(< 15 s) and replays never award; loops of one track award at most one full listen per day.

**Discovery Score** = 10 × lifetime points × (0.8 + 0.2 × diversity), where diversity is the
normalized entropy of genres across the listener's discoveries in the last 90 days. **Level** is a
step function of the score (8 named levels, then numbered). **Streak** = consecutive local days
(listener's time zone) with at least one new-song discovery — opening the app is not enough.

## 6. Privacy

Rankings: handle required + opt-out respected. Stats and history are private (RLS + security
invoker functions reading the caller's rows only). Percentiles are aggregate only. Location is
country (+ optional city text); no coordinates are ever stored. Analytics: signed-in only, no IP/UA,
retention 180 days.

## 7. Definition of done for P0

App builds, typecheck/lint/unit/pgTAP pass, existing e2e flows unchanged except navigation;
the feed works on mobile widths (snap scroll, 44 px targets), previews preload one ahead and
unload behind, Like/Save/Follow/Share work, `en`/`pl` complete, a new account with no history gets
a non-empty feed when public music exists, stats/score/points/streak/goals/ranking are computed
from the ledger.

## 8. Status (2026-10-07)

Implemented in this change: all of P0 and the P1 items marked ✅ above.

Verified: migrations from zero + pgTAP (`discovery.test.sql`, 50 assertions) + `db lint`; unit tests
for ranking/progress (`packages/shared/src/discovery`); typecheck, lint, build; E2E smoke (feed,
onboarding, browse, You, rankings in both languages, no horizontal scroll); a manual run on a local
catalog (8 artists, 7 countries): preview playback with preload and auto-advance, awards
(+14 for a new song/artist/genre/country), like/save/follow, You page, rankings, shared song page,
Open Graph and story/square cards.

Known gaps / next:

- Guidon tasks for M13 must be created from §3 (no Guidon access from the implementation session).
- Previews use AAC only (as the delivery tiers do); a browser without AAC shows "can't play the
  preview" — a FLAC/Opus preview variant would need a worker change.
- ~~Per-listener weight tuning~~ — done 2026-10-08, see below.
- Done 2026-10-08: feed aggregates are materialized views refreshed every 5 minutes by pg_cron
  (`private.track_stats`, `private.track_country_listeners`).

### Update 2026-10-08

Added: artists choose the Discover preview in the release editor (`set_track_preview`, 15–30 s,
also after publishing); similar-listener signal from shared listening (`my_taste().co_listened`);
"+2" notice for saves; QR codes on story/square/weekly cards; following people (`user_follows`,
public counts, private lists) and **You vs friend** (`compare_with`) — allowed only by the
compared person's `activity_visibility`: everyone, only people they follow, or nobody.

### Integration with `work` (2026-10-08)

`work` built M7–M11 in parallel (soundchecks, artist graph, events, DSA reports, people follows and
blocks, payouts base, retention, legal). Where both did the same thing, `work`'s implementation is
kept and Discover uses it: previews are **soundcheck** listens (`record_listen(..., soundcheck)`),
reports go through the DSA form (`/report`), follows/blocks/visibility come from M8.2 (compare uses
`can_view_activity`), "Discover this artist" boosts the artist graph (`related_artists`), the
artist picks the excerpt with the soundcheck start in the track form (my separate preview editor
was dropped). The Discover migrations were renumbered after `work`'s (`20261008100000…`).
Navigation: Discover · Scene · Search · Library · You (Browse is linked from the feed bar).

### Per-listener weight tuning (2026-10-08)

Every feed event already carries the reason code the item was shown for. `my_feed_outcomes()`
returns, per reason and over the caller's last 60 days, the distinct songs shown, kept (liked,
saved or artist followed), finished and skipped; pinned items (`shared`, `artist_spotlight`) do
not count. `tuneWeights()` (`packages/shared/src/discovery/tune.ts`, constants in `TUNING`) maps
each reason to the feature it stands for, compares its success rate (kept + ½ finished, per song
shown) with the listener's overall rate, shrinks it toward that rate with 20 pseudo-songs,
square-roots the lift and clamps it to ×0.75…×1.33. Nothing changes below 40 songs shown or with no
success at all. Applied in For You and Global only — Nearby/New/Rising are lenses the listener
chose — and never to the exploration share, which stays the listener's setting.

### Seasons and weekly challenges (2026-10-08)

- **Seasons** are calendar quarters (UTC) — the same for every region, nothing to maintain. Rankings
  gain "Season" and "Last season"; a daily pg_cron job closes the previous quarter into
  `season_results`: every participant's final global place, points and percentile (counting also
  listeners hidden from public rankings — the row is visible only to its owner, on You). A top-10 %
  finish among at least 10 participants unlocks **Season Star**.
- **Weekly challenges**: three per UTC week, the same for everyone (a shared topic is what makes
  them social), picked deterministically from `discovery_challenges` (10 to start: new songs,
  artists, genres, countries, world regions, saves, shares, full listens, artists with ≤ 50
  followers, days with a discovery). Progress is counted from the ledger, so only real discoveries
  count and every anti-abuse rule applies; a reached target pays 20 points (`challenge`, once per
  challenge and week) through a trigger on `discovery_points`, so listens, saves and shares all
  complete them. A fresh completion shows a notice; 10 completed unlock **Challenger**.
- Why not personalized challenge targets: adaptive goals already cover "your pace"; challenges are
  deliberately shared so friends can compare the same task. Staff tune targets in the table.
