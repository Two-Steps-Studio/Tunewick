# TuneWick Discovery v2 — gamification, social, statistics, global discovery, Replay (M14)

> Status: plan + implementation in milestones (2026-10-08). Builds on M13
> ([discovery-expansion.md](discovery-expansion.md)) — nothing is rewritten, nothing removed.
> Guidon: no access from the implementation session; the milestones below are the task list to
> mirror there.

The product metric is **discovery**, not listening time: every feature below gives a reason to
find one more artist, song or genre — and never rewards replaying the same thing.

## 1. What already exists (audit)

| Brief | Already in the product | Gap |
| --- | --- | --- |
| Discovery feed | Vertical feed, previews, modes For You/Global/Nearby/New/Rising, exploration share, diversity, reason codes, per-listener weight tuning, shared-song pinning, "Discover this artist" | Daily Discovery, Weekly Drop, Surprise Me modes, Underground Radar, Fresh 24 h/7 d/30 d, Similar To This (track), "Why this song?" explanations |
| Discovery Score | Ledger `discovery_points` (anti-abuse in the DB), score = points × diversity | Underground bonus; separate XP (engagement) from Score (discovery quality) |
| Gamification | Levels, streaks, adaptive goals, achievements (14), weekly challenges (3/week), seasons | XP with mission rewards, daily/monthly missions, special events, more badges (night, underground, machine, year) |
| Social | Follow artists and people (M8.2), blocks, activity visibility, You vs friend | Friends activity, friends rankings, common artists/genres, granular privacy |
| Global | Countries/regions model, rankings of discoverers by country/region, browse by country | Music charts (Top 100 global/country/region/city/genre, rising, underground, most discovered/saved/shared), "Popular in X", Discover the world |
| Music map | Artist graph (M7), venues, events | Geographic atlas: country → city → scene (artists, venues, events, genres) |
| Profile / stats | You page: score, level, streak, goals, stats week/month/all, records, weekly recap | Hours/day heatmaps, top artist/song/album, music personality, charts |
| Sharing | Song cards (OG/story/square, QR), weekly stats card, MP4 clips | #1 artist/song, Discovery Score, new artist, monthly, Replay cards |
| Recaps | Weekly recap | Monthly recap, **Replay** (yearly story), year-over-year comparison |
| Artist discovery | Country, genres, popular songs, related artists, events | Artist discovery score, growth, new listeners, top countries/cities, "Why you might like" |

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| V1 | **XP** = everything in the ledger (discoveries, completions, missions, streak/day bonuses). **Discovery Score** = only discovery kinds (new song/artist/genre/country, underground, finished discoveries) × genre diversity. Levels follow XP. Point rules ×10 so XP reads naturally ("+30 XP new artist", missions +100…+300 XP) | Two numbers with two meanings: effort/engagement vs. how widely you discover; both anti-farm because both come from the same ledger |
| V2 | Heavy numbers are **precomputed**: per-listener daily aggregates (pg_cron, incremental), chart materialized views (refreshed every 15 min), recaps cached in `user_recaps` once per finished period | No page computes a year of history on render |
| V3 | Charts count **listeners**, not plays (≥ 30 s, no soundchecks), over 7 days; country/region charts use the listener's country, **city charts mean the local scene** (artists from the city) — listener cities are free text, sparse and too identifying | Fair, hard to game with loops, privacy-safe |
| V4 | Any aggregate that shows a place shows it only with **≥ 3 listeners** (k-anonymity) | No inference about single people |
| V5 | Daily Discovery and Weekly Drop are **materialized per listener per period** on first open (stable list, completable), from the same candidates/ranking as the feed, new music only | Stable "today's set" that can be finished; cheap |
| V6 | "Why this song?" explains the **real signal** behind the reason code in plain words, with numbers when they are real ("8,000 listeners"). No "AI" wording | Honest |
| V7 | Missions generalize weekly challenges: cadence daily/weekly/monthly/event, XP per mission, rotation per period, events with a time window — definitions are data | New missions without deploys |
| V8 | Badges stay data-driven (`achievements`); new metrics are computed in one function — adding a badge of an existing metric is an insert | Extensible |
| V9 | Privacy: `profile_settings` gains `profile_public`, `show_stats`, `show_score`, `show_badges`, `show_replay` (defaults: public profile, the rest visible to followers); rankings keep `show_in_rankings` (opt-out) | Each public surface has its own switch |
| V10 | Replay is generated once the year ends (from 1 December a "so far" preview), cached; the story UI is client-side CSS animation with `prefers-reduced-motion` respected | Fast, shareable, no layout jank |

## 3. Milestones

| Milestone | Scope |
| --- | --- |
| **M14.1 Foundations** | XP/Score split and ×10 rules, `underground` ledger kind, per-listener daily aggregates (cron), privacy flags |
| **M14.2 Charts & global** | Charts MV (global/country/region/genre/city-scene, rising, underground, most discovered/saved/shared), Top 100 pages, Fresh 24 h/7 d/30 d, "Popular in …", Discover the world |
| **M14.3 Daily & weekly** | Daily Discovery, Weekly Drop, Surprise Me modes, Similar To This, "Why this song?" |
| **M14.4 Missions & badges** | Daily/weekly/monthly/event missions with XP, new badges, XP bar/level UI |
| **M14.5 Stats & profile** | Detailed stats with charts, music personality, public music profile |
| **M14.6 Monthly recap & cards** | Monthly recap, share cards (#1 artist/song, score, new artist, monthly) |
| **M14.7 Replay** | Yearly story (18 screens), year vs year, Replay card |
| **M14.8 Social** | Friends activity, friends rankings, common artists/genres, privacy settings UI |
| **M14.9 Artist discovery** | Artist discovery score, growth, new listeners, top places, why you might like |
| **M14.10 Music map** | Atlas: country → city → scene (artists, venues, events, genres) |

Each milestone ships database (RLS, indexes, pgTAP), backend, UI with loading/empty/error
states, mobile and desktop layouts, EN/PL, tests, and its line in §4.

## 4. Status

- **M14.1 done** — `20261009100000_xp_foundations`: point rules ×10 (XP), `underground` kind
  (+40 XP, artist < 10,000 listeners in 30 days), `my_progress.discovery_points_total` (Score input),
  `listening_daily` + `private.refresh_listening_daily()` every 10 min (incremental watermark, local
  days, hours histogram, previews excluded, 25-month retention), privacy switches on
  `profile_settings` + `private.can_view(owner, level)`. UI: XP wording, level from XP, Score
  explained. Export includes `listening_by_day`. pgTAP `m14_foundations.test.sql`.
- **M14.2 done** — `20261009110000_charts`: MVs `private.track_charts`, `private.track_chart_places`
  (≥ 3 listeners per place), `private.artist_charts`, refreshed every 15 min; `music_chart`
  (top/rising/underground/discovered/saved/shared × global/country/region/city scene/genre),
  `artist_chart` (rising/underground/new listeners/discovered), `fresh_releases` (24 h/7 d/30 d),
  `music_cities`, `world_tracks`. Page `/charts` (`/listy`): tabs, scopes, "Popular in …" for the
  listener's country, city scenes, play-from-here queues (audio presigned only on tap), Discover the
  world; loading/error states (`components/feedback/segment-error.tsx`), links from the feed and
  Browse. pgTAP `charts.test.sql`, E2E smoke.
- **M14.3 done** — `20261009120000_discovery_sets`: `discovery_sets` (per listener and local
  day / ISO week, stored on first open — stable, completable), `save_discovery_set` /
  `my_discovery_set`, completion trigger on the ledger (5 daily / 10 weekly discoveries →
  `daily_complete` +100 XP, `weekly_complete` +250 XP, once per period). `@tunewick/shared`:
  journeys (Surprise me, Something new, Outside my taste, Underground, Global, Similar to me) as
  lenses on the feed ranking with fallback, `pickDaily` / `pickWeekly` (new releases, new artists,
  underground, rising, outside your usual; avoids today's daily songs), `explain()` for "Why this
  song?" (real signal + real numbers, "no AI" note). Feed: `?journey=`, `?similar=<code>` ("Similar
  to this" from the card menu: genres + artist graph), `?set=daily|weekly`; reason chip opens the
  Why panel. Page `/today` (`/dzis`) with loading/error states; "Today" chip leads the feed bar.
  pgTAP `discovery_sets.test.sql`, unit tests, E2E `today.spec.ts`.
- **M14.4 done** — `20261009130000_missions`: `discovery_challenges` gains cadence (daily /
  weekly / monthly / event with a window) and XP; stable shared rotation per UTC period (3 / 3 / 2,
  all running events); metrics include artists from different countries, underground finds and
  completing Daily Discovery; `private.award_points` pays a mission's own XP once per period;
  `my_missions()` replaces `my_challenges()`. New badges: Globetrotter (10 countries), Underground
  Hunter (50), Night Listener (≥ 40 % of ≥ 100 plays at 22:00–05:00, from `listening_daily`),
  Discovery Machine (150 songs in a week), Year Explorer (20,000 discovery XP in a year). Mission
  names come from metric + target (a new mission is a row, no translation). UI: missions on You
  (all cadences) and Today (today's + events), completion notices. pgTAP `missions.test.sql`.
