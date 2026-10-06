# Product Definition

> Status: **approved direction; legal questions L1–L6 open** (Phase 1, Guidon: "Phase 1: Product audit & definition").
> Last updated: 2026-10-05. Market facts are as of this date and must be re-checked before launch.

## 1. Vision

**Tunewick — discover more, listen better, connect deeper.**

Tunewick is a music platform where independent artists, local scenes and live events are the
center of the product, not a side shelf. Listeners come to find music they would never meet in
an algorithmic mainstream feed, hear it in the quality the artist actually mastered it in, and
follow it out of the app into real venues.

One sentence: **Tunewick is where a scene lives online — its records, its gigs and the people
who were there.**

## 2. The honest answer: "Why Tunewick instead of Spotify?"

The MVP catalog consists of music uploaded by independent artists who own the rights (decided
2026-10-05). That has a hard consequence:

> **Tunewick cannot replace Spotify at launch, because the mainstream catalog will not be there.**

So Tunewick must not position itself as "a better Spotify". It positions as **the place you go
for what Spotify is bad at**:

| Spotify (and Apple Music, Tidal) is good at | Tunewick wins at |
| --- | --- |
| Playing a song you already know | Finding artists you don't know yet, especially near you |
| Global, label-driven catalog | Local and independent scenes, with context (city, venue, crew, label) |
| Algorithmic feeds optimized for time-on-app | Discovery with visible reasons ("why am I hearing this?") |
| Concerts as a small tab sourced from ticketing partners | Events as a core object, linked to artists, venues and people who attended |
| Artist as a profile page with stats | Artist as an active participant: soundchecks, releases, gigs, direct fans |
| Audio quality as a tier badge | Audio transparency: what the master is vs. what you're hearing, never inflated |

**The primary user is someone who already pays for a mainstream service and wants a second,
smaller, more meaningful app for discovery and their local scene.** Replacing the main
subscription is a long-term goal, contingent on catalog licensing (see section 8).

## 3. Market audit (competitive landscape)

| Service | Strengths to learn from | What Tunewick must not copy / gap it leaves |
| --- | --- | --- |
| **Spotify** | Frictionless playback, personalization, playlists as culture. Lossless up to 24-bit/44.1 kHz FLAC for Premium since Sept 2025. | Opaque recommendations, pro-rata payouts that disadvantage small artists, paid promotion programs mixed into recommendations, engagement-optimized home feed. Lossless alone is no longer a differentiator vs. Spotify. |
| **Apple Music** | Editorial voice, lossless/Hi-Res (ALAC) and Dolby Atmos, lyrics, credits. | Closed ecosystem, weak local/indie discovery, Hi-Res requires external hardware and the UI does not clearly say what is actually delivered. |
| **Tidal** | Audiophile positioning, FLAC Hi-Res, credits and producer/songwriter pages. | Repositioned several times; quality story centered on major-label catalog; little community. |
| **Qobuz** | Hi-Res FLAC up to 24/192, booklets, editorial depth, download store. | Narrow audiophile/classical/jazz audience; no scene or community layer. |
| **Bandcamp** | Fan-to-artist money, direct support, lossless downloads, label pages, strong indie trust. | Not a streaming-first experience, weak player and discovery UX, ownership changes (Epic → Songtradr 2023) hurt community trust. |
| **SoundCloud** | Open upload, emerging artists, DJ/electronic culture, comments on timeline. | Low audio quality perception, noise/spam, discovery dominated by volume. |
| **Audiomack** | Free uploads for emerging artists, strong in specific genres/regions. | Ad-driven, low-fidelity, little context. |
| **Event apps (Resident Advisor, Bandsintown, Songkick, Facebook Events)** | Event discovery, ticketing links, "interested/going". | Events are disconnected from listening; no way to discover music *through* a venue or a scene. |

**Gap Tunewick fills:** nobody combines (a) high-fidelity, honest-quality streaming of independent
music, (b) local scene and event context, and (c) a music graph that links artists, venues,
labels and the people who were there.

## 4. Differentiators

Each differentiator states how it differs from the competitor equivalent (anti-clone rule).

### 4.1 Scene-first discovery
- **What:** Discovery organized around scenes (city/region + genre + venues + collectives) across all of Poland — small, independent artists from any city or town, not one region (decision D6).
- **Differs from Spotify:** Spotify's location signals are about where *listeners* are ("Top 50 Poland"). Tunewick models where *music comes from* and where it is *played live*.

### 4.2 Transparent discovery
- **What:** Every recommendation carries a short, true reason: "Played at Katofonia last month", "Same producer as X", "Followed by 3 people you follow". No reason, no recommendation.
- **Differs from Spotify:** Spotify's recommendations are opaque and may be influenced by paid programs. Tunewick separates paid promotion from recommendations and labels it (anti-payola).

### 4.3 Soundcheck (30 seconds)
- **What:** An artist chooses a 30-second excerpt that represents them. Soundchecks can be browsed quickly to sample many unknown artists, and each leads to the full track, the artist and their next gig.
- **Differs from Spotify Clips/Canvas:** Those are video decoration on tracks you're already playing. A Soundcheck is an audio-first introduction to an artist chosen by the artist, used for discovery rather than retention.

### 4.4 "Byłem przy tym" (I was there)
- **What:** Users mark attendance at real events. Attendance builds a personal music history (gigs, artists discovered live, venues), and links the event to its setlist/artists in the graph.
- **Anti-farming:** Marks are tied to a real event in a limited time window and are not a public counter race. Future option: verification (ticket or on-site code) for a "verified" badge.
- **Differs from Bandsintown/Facebook "going":** "Going" is an intention for promotion. "Byłem przy tym" is a memory that becomes part of the listener's identity and the scene's history.

### 4.5 Events as a core object
- **What:** Events are first-class objects that link artists, venues, cities and attendees. The product answers "What is happening around me this weekend, and what does it sound like?"
- **Differs from Spotify's concert tab:** Spotify lists ticketing feeds. In Tunewick an event is playable (lineup soundchecks/playlist), is a discovery source and leaves a history.

### 4.6 Music Graph
- **What:** Relationships between artists, tracks, releases, producers, songwriters, labels, venues, events, cities, playlists and users. It is mostly invisible and expressed as discovery paths ("Artist → producer → another artist → their next gig").
- **Differs from Tidal credits:** Credits are a static list. The graph is used for navigation and recommendation, and it includes the live/local dimension.

### 4.7 Honest audio quality
- **What:** The player shows both the **source** (what the artist uploaded, e.g. FLAC 24/96) and the **delivered** stream (e.g. FLAC 24/48 on this browser). Uploads are analyzed to detect fake Hi-Res (upsampled or transcoded from lossy), and labels are only shown when true.
- **Differs from Spotify/Apple/Tidal:** They show tier badges. Tunewick shows the actual path and refuses to label lossy-origin audio as lossless.
- **Note:** Since Spotify offers 24/44.1 lossless, "we have lossless" is not a selling point by itself. The differentiators are **transparency** and **independent artists' original masters at full resolution**.

### 4.8 Artist-first ecosystem
- **What:** Verified artist profiles, releases, soundchecks, events, announcements and fan connection without turning into a social feed. Long-term: fair payout model (see open decision D2).
- **Differs from Spotify for Artists:** It's a tool to manage your presence *inside* the scene (gigs, collaborators, venues), not just a statistics dashboard.

## 5. Personas

### P1 — "Scena" listener (primary)
Kasia, 27, Katowice. Pays for a mainstream service. Goes to 2–4 gigs a month (Katofonia, club nights, small festivals). Frustrated that her mainstream app keeps recommending the same artists, and that she finds local bands only through Instagram posters.
**Needs:** discover local/independent artists with context, know what's on this weekend, keep a history of gigs.

### P2 — Audiophile
Marek, 41, owns a DAC and good headphones. Uses Qobuz/Tidal. Distrusts "Hi-Res" labels.
**Needs:** know exactly what he's hearing (codec, bit depth, sample rate, source vs delivered), gapless albums, no hidden resampling where avoidable.

### P3 — Independent artist (supply side, critical for MVP)
Zespół from Gliwice, self-releases via a distributor, plays local clubs, has studio masters in 24-bit WAV/FLAC.
**Needs:** upload in original quality, a profile that connects music with gigs, reach listeners in their region, understand who listens, keep rights and control.

### P4 — Venue / organizer / collective
A club or promoter in a Polish city running 10–20 events a month.
**Needs:** publish events with lineups, reach people who like those artists, show the venue's musical identity over time.

### P5 — Admin / moderator (internal)
**Needs:** verify artists, review uploads and rights declarations, handle takedowns, manage promo codes, audit actions.

## 6. MVP scope

The MVP follows section 78 of the Master Prompt, adjusted to the indie-upload content model.
Detailed acceptance criteria per item live in Guidon tasks.

**Supply side (required for anything else to work)**
- Artist account, artist verification request, artist profile.
- Upload of releases (single/EP/album): audio files, metadata, artwork, credits, release date, explicit flag, AI-content declaration (human / AI-assisted / AI-generated), **rights declaration**.
- Upload validation and quality analysis (codec, sample rate, bit depth, duration, corruption, basic fake-Hi-Res/lossy-origin detection).
- Moderation queue: approve/reject release before publishing.
- Soundcheck selection (30 s excerpt).

**Listener side**
- Auth: registration, login, logout, password reset, profile.
- Home: personalized discovery (scene-based, new releases, soundchecks, events this week).
- Search: tracks, artists, releases, playlists (+ events, venues as basic).
- Artist, release and track pages.
- Player: play/pause, seek, next/prev, queue (add next/end, reorder, remove, clear), shuffle, repeat, volume, quality selection, honest quality indicator (source vs delivered), gapless where possible.
- Audio: multiple variants (lossy for data saving, lossless FLAC, Hi-Res where source supports), adaptive delivery, signed URLs.
- Library: likes (tracks, releases, artists), listening history, playlists (create, edit, delete, reorder, play).
- Discovery: basic recommendations with reasons, related artists, related tracks.
- Social (minimal): follow artists and users, basic activity.
- Events: basic events (venue, date, lineup linked to artists), "Byłem przy tym".
- Music Graph: basic relationships (artist ↔ release ↔ track ↔ credits ↔ label ↔ event ↔ venue ↔ city).

**Business / platform**
- Entitlements: Free and Premium, independent of payment provider.
- Promo codes: redemption, admin management, campaigns (server-side, transactional, rate-limited).
- Admin: users, artists, content, moderation, promo codes, audit log.
- i18n: Polish and English.
- GDPR basics: consent, privacy policy, data export/deletion request path.

## 7. Explicit MVP exclusions

| Excluded | Why / when |
| --- | --- |
| Commercial label/major catalog | Requires licensing agreements; revisit after traction (section 8). |
| Payments via card (Stripe etc.) | MVP Premium is granted via promo codes/beta (decision D3). Payment integration is Phase 14; architecture keeps entitlements provider-agnostic. |
| Native mobile/desktop apps | PWA first. Native desktop is the path to true bit-perfect/exclusive mode later. |
| Offline downloads | Architecture prepared; feature later. |
| Dolby Atmos / spatial audio | Licensing and tooling cost; later. |
| Listening parties, chat, comments | Community beyond follows/activity comes after core discovery works. |
| Ticketing, merch, tipping, marketplace | Future monetization; not MVP. |
| Natural-language/AI search, AI playlists | AI assists later; MVP recommendations are rule/graph based with explicit reasons. |
| Audio fingerprinting (full) | MVP does checksum and metadata duplicate detection; fingerprinting (e.g. Chromaprint/AcoustID) is a follow-up task. |
| Cross-device playback handoff | Later; queue/position persistence is designed in from the start. |
| Gamification beyond "Byłem przy tym" | Later; must stay meaningful. |

## 8. Content & rights model

**Decided (2026-10-05):** MVP content is uploaded by independent artists (or their own small labels)
who own or control the rights and declare this on upload.

What this involves:
- **Master (phonogram) rights:** owned by the uploader; granted to Tunewick through the Artist Terms (non-exclusive streaming license, territory, revocable with takedown).
- **Composition (author) rights:** if the songwriter is a member of a collective management organization (in Poland **ZAiKS**), the making-available right for streaming is typically managed by that organization, even if the artist uploads the track themselves. Tunewick then needs a license from ZAiKS (and equivalents abroad) and must report usage.
- **Related rights of performers and producers:** organizations such as **STOART**, **SAWP** (performers) and **ZPAV** (phonogram producers) may also have claims depending on membership and the type of use.
- **Non-members:** an artist who is not a member of any collective organization can license their music directly. The upload flow must ask about membership.
- **Takedown:** notice-and-takedown process with counter-notice, required regardless (EU DSA obligations for hosting services).
- **AI-generated music:** declared by the uploader; displayed transparently; never assigned by accusation.

> This section must be validated by a lawyer specialised in Polish/EU copyright before public launch.
> Detailed model goes to docs/licensing.md (Phase "Licensing").

## 9. Open legal and business questions

| # | Question | Owner |
| --- | --- | --- |
| L1 | Does Tunewick need a ZAiKS license (and STOART/ZPAV/SAWP agreements) for streaming indie uploads where any author/performer is a member? Cost model (revenue % minimum)? | Lawyer + owner |
| L2 | Artist Terms: license scope, territory (PL → EU → world), duration, revocation, warranties and indemnity for false rights declarations. | Lawyer |
| L3 | EU DSA obligations as a hosting platform (notice-and-action, statement of reasons, transparency report thresholds). | Lawyer |
| L4 | GDPR: legal bases for listening history and recommendations, analytics consent, retention periods, DPO need. | Lawyer |
| L5 | Minimum age for accounts (GDPR consent in Poland: 16 for information society services without parental consent) and community features. | Lawyer + owner |
| L6 | Consumer law for subscriptions and promo codes (cancellation, withdrawal right, clear pricing, Omnibus directive for discounts). | Lawyer |
| D1 | Brand/legal entity operating tunewick.com (Two Steps Studio?). | Owner |


### Decided by owner (2026-10-05)

| # | Decision |
| --- | --- |
| D2 | **User-centric payouts** once paid plans exist: a subscriber's payment goes to the artists that subscriber listens to. Data model must record per-user listening attributable to artists from day one. |
| D3 | **No card payments in MVP.** Premium is granted via promo codes and beta access. Payment provider integration is Phase 14; entitlements stay provider-agnostic. |
| D4 | **Free = full catalog in High (lossy) quality. Premium = Lossless and Hi-Res** (where source allows). No artificial listening restrictions on Free. |
| D5 | **Closed beta first:** ~30–50 invited artists and 5–10 venues, invite codes, then public beta. (Originally GZM-only; widened by D6.) |
| D6 | **All of Poland, small independent artists** (owner, 2026-10-06): no regional limit — artists from any city or town in Poland; scenes are a way to explore, not a gate. Small/independent first: no label catalog (see MVP content decision). |

## 10. Key risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Cold start** — few artists, empty catalog | Product feels empty; no listeners | Invite small independent artists from across Poland before public beta (several cities/scenes, not one); artist invite codes; venue partnerships. |
| Listeners won't use a second app | Low retention | Narrow, sharp value: "what's on + what it sounds like + I was there". Events and soundchecks give reasons to return. |
| Collective-licensing cost/complexity | Legal exposure or blocked launch | Resolve L1 before public launch; ask membership on upload. |
| False rights declarations / infringing uploads | Legal exposure | Moderation queue, artist verification, duplicate/fingerprint checks, takedown process, indemnity in terms. |
| Fake Hi-Res uploads | Breaks the audio-trust promise | Quality analysis on ingest; label only verified properties. |
| Scope creep (social network) | Delays core | Anti-social-feed principles, MVP exclusions list, every feature needs a Guidon task. |
| Audio delivery costs (lossless egress) | Burn rate | CDN choice in architecture phase; lossless as Premium; efficient caching. |

## 11. Success metrics (MVP)

Avoid vanity metrics. Track:
- **Discovery success:** % of listeners who save or follow a previously unknown artist per week.
- **Scene connection:** event page → "Byłem przy tym" / event attendance from the app.
- **Artist value:** artists with ≥1 new follower per week; artists returning to publish.
- **Listening quality:** completed tracks ratio, skip rate in discovery contexts.
- **Retention:** week-4 retention of listeners.
- **Audio:** distribution of selected quality modes; playback failures/buffering.
- **Premium/promo:** promo redemption → continued use.

## 12. Product principles (summary)

1. Discovery has context. No reason, no recommendation.
2. Never claim what isn't true: quality, entitlements, stats, events.
3. Artists and scenes first; promotion is always labeled.
4. Community serves discovery, not engagement metrics.
5. Every feature answers "what makes the Tunewick version different?"
