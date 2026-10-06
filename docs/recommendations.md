# Discovery & Recommendations

> Status: **v0.1 specification for MVP.** MVP discovery is **rule- and graph-based with explicit
> reasons**. Machine-learned models come later and must keep the same transparency contract.

## 1. Principles

1. **No reason, no recommendation.** Every recommended item carries a true, human-readable reason.
2. **Scene-first:** local (user's city/region) and independent artists are first-class signals.
3. **Diversity by design:** caps on repetition of the same artist/genre per surface.
4. **Novelty with familiarity:** mix known-adjacent and genuinely new.
5. **Anti-payola:** paid promotion never enters recommendation ranking; promoted placements (future) are separate slots labeled "Promoted".
6. **No fake data:** empty states are honest ("Not enough listening yet — start with your city's scene"), never filled with invented items.

## 2. Signals (MVP)

| Signal | Source |
| --- | --- |
| User's likes, follows, completed plays, skips | `track_likes`, `release_likes`, `artist_follows`, `listening_events` |
| Home city / region | `profiles.home_city_id` (user-chosen) |
| Graph relations | `graph_edges`: same producer/songwriter, same label, played same event, same venue, collaborators, shared genres |
| Events | upcoming `events` near the user; lineups of events the user marked |
| Freshness | release dates, new soundchecks |
| Community | follows of people the user follows (only when those users' visibility allows) |

No demographic inference, no cross-site tracking, personalization only with consent (otherwise
non-personalized city/genre/new-release surfaces).

## 3. Surfaces (MVP)

| Surface | Logic | Example reason |
| --- | --- | --- |
| **This week near you** | Upcoming events in user's region, ranked by affinity of lineup artists + date | "Gra w sobotę w Katowicach · podobne do X, którego obserwujesz" |
| **Soundcheck stack** | Soundchecks of artists the user doesn't know yet, weighted to region and adjacent genres | "Nowy artysta z Gliwic · ten sam producent co Y" |
| **New from your scene** | New releases by followed artists, then local artists | "Nowe wydawnictwo · obserwujesz" |
| **Because you liked X** | Graph neighbours of liked artists/releases | "Ten sam producent / grali razem w Z" |
| **Related artists** (artist page) | Weighted graph neighbours + co-listening (when data allows) | "Grali razem na …" |
| **Related tracks** (track page) | Same release context, credits, co-listening | "Ten sam autor tekstu" |

## 4. Ranking (MVP formula)

For candidate `c` for user `u`:

```
score = w_aff · affinity(u, c)        // graph distance to liked/followed entities
      + w_loc · locality(u, c)        // same city > same region > same country
      + w_new · novelty(u, c)         // not heard before by u
      + w_fresh · freshness(c)        // recent release / upcoming event
      − w_rep · repetition(u, c)      // shown recently / same artist already on surface
```

Then **diversity re-ranking**: max 1 item per artist per surface row, max 40% of one genre, at
least 30% from artists the user has never played (when available). Weights are config values
(feature flags), tuned with discovery-success metrics, not engagement time.

Each candidate keeps the `reason_code` of its strongest contributing signal; listening events
record `reason_code` so discovery success is measurable.

## 5. Smart shuffle (MVP-light)

Shuffle avoids: same artist back-to-back, tracks played in the last N plays, recently skipped
tracks; respects playlist context. Implemented as a constrained shuffle, not a random sort.

## 6. Cold start

New users pick a home city (optional) and a few genres/artists; without consent or input they get
non-personalized surfaces (city scene, new releases, upcoming events). New artists get exposure
through Soundcheck stack and local surfaces, independent of follower count.

## 7. Metrics

Discovery success (save/follow of previously unknown artist), new-artist share of listening,
skip rate in discovery contexts, event interactions from discovery, diversity indices. Not
optimized for raw time-on-app.

## 8. Later

Collaborative filtering and embeddings (audio similarity), natural-language discovery
("nowi artyści z Twojego miasta podobni do X"), AI-assisted playlists — all must output a reason and
respect the same diversity and anti-payola rules.
