# Ads

Tunewick earns from ads without getting in the way of the music. The rules below are product
decisions; the code enforces them (`supabase/migrations/20261020090000_ads.sql`,
`apps/web/src/modules/ads`).

## Who sees ads

- Visitors and listeners on the **Free** plan. **Premium never sees ads** - one more reason to
  upgrade, and the reason ads stay rare.
- Nobody is profiled. A card is chosen by **placement and interface language only**, never by who
  is looking, what they listened to or where they are. No ad network, no third-party script, no
  cookie: nothing here needs a consent banner.

## Where ads may appear

| Placement | Where on the page |
|---|---|
| `browse` | Between new releases and new artists |
| `charts` | Below the main chart |
| `scene` | Below the upcoming events |
| `library` | At the very bottom of the library |

Never: the player or full-screen player, the Discover feed (it plays continuously), artist,
release or playlist pages (that space belongs to the artists and listeners), search, settings,
admin, embeds, e-mails. At most one card per page. Ads are never animated and never make sound.

## What an ad is

A campaign either

- **promotes a release on Tunewick** (`artist/release`): the card shows its cover and opens the
  release page - artists and labels can pay to reach listeners, and it is still music by people;
- or links to an **external https site** (a venue, a festival, a shop), opened in a new tab with
  `rel="sponsored"`.

Every card is labelled "Sponsored" with the advertiser's name.

## Running a campaign

Admin (with MFA) → **Ads** (`/admin/reklamy`). New campaigns start paused; set placements,
languages (none = all), an optional date range and a weight (1-10, how often it is drawn compared
with other running campaigns), then start it. The list shows impressions and clicks for the last 30
days.

## Statistics

`private.ad_stats` holds anonymous daily counts per campaign and placement: an impression is
counted once half the card has been on screen for a second, a click when its link is followed.
Counts are not verified against bots or repeated reloads - treat them as indicative. Kept for two
years.
