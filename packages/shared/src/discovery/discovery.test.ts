import { describe, expect, it } from "vitest";
import {
  diversity,
  discoveryScore,
  EMPTY_TASTE,
  currentSeason,
  goalsFor,
  levelFor,
  MODE_WEIGHTS,
  previewWindow,
  rankFeed,
  seasonOf,
  tuneWeights,
  TUNING,
  explain,
  periodSeed,
  pickDaily,
  pickWeekly,
  rankJourney,
  type Candidate,
  type Taste,
} from ".";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function candidate(id: string, patch: Partial<Candidate> = {}): Candidate {
  return {
    trackId: id,
    artistId: `artist-${id}`,
    genreIds: [1],
    countryCode: "PL",
    macroRegion: "europe",
    languages: [],
    publishAt: daysAgo(10),
    listeners30d: 10,
    listeners7d: 3,
    listenersPrev7d: 3,
    plays30d: 20,
    completionRate: 0.5,
    replayRate: 0.1,
    saveRate: 0.05,
    skipRate: 0.2,
    countryListeners30d: 0,
    ...patch,
  };
}

function taste(patch: Partial<Taste>): Taste {
  return { ...EMPTY_TASTE, ...patch };
}

describe("rankFeed", () => {
  it("is deterministic for a seed and never repeats or exceeds the page size", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      candidate(`t${i}`, { genreIds: [i % 6], artistId: `a${i % 10}` }),
    );
    const a = rankFeed(pool, EMPTY_TASTE, { mode: "for_you", size: 8, seed: 7, now: NOW });
    const b = rankFeed(pool, EMPTY_TASTE, { mode: "for_you", size: 8, seed: 7, now: NOW });
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    expect(new Set(a.map((item) => item.trackId)).size).toBe(8);
  });

  it("gives a new listener a full feed from popularity and freshness (cold start)", () => {
    const pool = [
      candidate("popular", { listeners30d: 500, artistId: "x" }),
      candidate("fresh", { publishAt: daysAgo(0), listeners30d: 0, artistId: "y" }),
      candidate("old", { publishAt: daysAgo(400), listeners30d: 0, artistId: "z" }),
    ];
    const feed = rankFeed(pool, EMPTY_TASTE, { mode: "global", size: 3, seed: 1, now: NOW });
    expect(feed.map((item) => item.trackId)).toEqual(["popular", "fresh", "old"]);
    expect(feed[0]!.reason.code).toBe("popular");
  });

  it("prefers the listener's genres and explains it", () => {
    const pool = [candidate("jazz", { genreIds: [16] }), candidate("metal", { genreIds: [6] })];
    const feed = rankFeed(pool, taste({ genres: new Map([[16, 9]]) }), {
      mode: "for_you",
      size: 2,
      seed: 3,
      now: NOW,
      explorationShare: 0,
    });
    expect(feed[0]).toMatchObject({
      trackId: "jazz",
      reason: { code: "genre_you_like", genreId: 16 },
    });
  });

  it("pushes already discovered and skipped songs to the end", () => {
    const pool = [candidate("heard"), candidate("skipped"), candidate("new")];
    const feed = rankFeed(
      pool,
      taste({ heard: new Set(["heard"]), skipped: new Set(["skipped"]) }),
      { mode: "for_you", size: 3, seed: 2, now: NOW, explorationShare: 0 },
    );
    expect(feed[0]!.trackId).toBe("new");
    expect(feed.at(-1)!.trackId).toBe("heard");
  });

  it("keeps the same artist apart and no genre above 40 % when alternatives exist", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) =>
        candidate(`rock${i}`, {
          genreIds: [1],
          artistId: i < 5 ? "same" : `r${i}`,
          listeners30d: 100,
        }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        candidate(`other${i}`, { genreIds: [10 + (i % 3)], artistId: `o${i}`, listeners30d: 1 }),
      ),
    ];
    const feed = rankFeed(pool, taste({ genres: new Map([[1, 10]]) }), {
      mode: "for_you",
      size: 10,
      seed: 5,
      now: NOW,
      explorationShare: 0,
    });
    const byId = new Map(pool.map((c) => [c.trackId, c]));
    const artists = feed.map((item) => byId.get(item.trackId)!.artistId);
    artists.forEach((artist, i) =>
      expect(artists.slice(Math.max(0, i - 3), i)).not.toContain(artist),
    );
    const rock = feed.filter((item) => byId.get(item.trackId)!.genreIds[0] === 1).length;
    expect(rock / feed.length).toBeLessThanOrEqual(0.4);
  });

  it("never lets an experiment slot repeat the artist just played when others exist", () => {
    const pool = [
      candidate("a1", { artistId: "a", genreIds: [7], listeners30d: 0 }),
      candidate("a2", { artistId: "a", genreIds: [7], listeners30d: 0 }),
      ...Array.from({ length: 6 }, (_, i) =>
        candidate(`k${i}`, { artistId: `k${i}`, genreIds: [1] }),
      ),
    ];
    const listener = taste({ genres: new Map([[1, 5]]), countries: new Map([["DE", 5]]) });
    for (let seed = 1; seed <= 30; seed++) {
      const feed = rankFeed(pool, listener, {
        mode: "for_you",
        size: 8,
        seed,
        now: NOW,
        explorationShare: 0.5,
      });
      const artists = feed.map((item) => pool.find((c) => c.trackId === item.trackId)!.artistId);
      artists.forEach((artist, i) =>
        expect(artists.slice(Math.max(0, i - 3), i)).not.toContain(artist),
      );
    }
  });

  it("mixes in experiments at roughly the configured share", () => {
    const known = Array.from({ length: 60 }, (_, i) =>
      candidate(`k${i}`, { genreIds: [1], artistId: `k${i}` }),
    );
    const unknown = Array.from({ length: 60 }, (_, i) =>
      candidate(`u${i}`, {
        genreIds: [2 + (i % 8)],
        countryCode: "JP",
        macroRegion: "asia",
        artistId: `u${i}`,
      }),
    );
    const listener = taste({ genres: new Map([[1, 5]]), countries: new Map([["PL", 5]]) });
    let explored = 0;
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const feed = rankFeed([...known, ...unknown], listener, {
        mode: "for_you",
        size: 20,
        seed,
        now: NOW,
      });
      explored += feed.filter((item) => item.exploration).length;
      total += feed.length;
    }
    expect(explored / total).toBeGreaterThan(0.15);
    expect(explored / total).toBeLessThan(0.35);
  });

  it("labels experiments honestly", () => {
    const listener = taste({ genres: new Map([[1, 5]]), countries: new Map([["PL", 5]]) });
    const feed = rankFeed([candidate("jp", { genreIds: [9], countryCode: "JP" })], listener, {
      mode: "for_you",
      size: 1,
      seed: 1,
      now: NOW,
      explorationShare: 0.5,
    });
    if (feed[0]!.exploration) expect(feed[0]!.reason).toEqual({ code: "new_genre", genreId: 9 });
  });

  it("Nearby puts the listener's country first; New puts the newest first", () => {
    const pool = [
      candidate("de", { countryCode: "DE", listeners30d: 300, artistId: "de" }),
      candidate("pl", {
        countryCode: "PL",
        listeners30d: 1,
        artistId: "pl",
        publishAt: daysAgo(90),
      }),
      candidate("today", {
        countryCode: "DE",
        publishAt: daysAgo(0),
        listeners30d: 0,
        artistId: "t",
      }),
    ];
    const nearby = rankFeed(pool, taste({ country: "PL", macroRegion: "europe" }), {
      mode: "nearby",
      size: 3,
      seed: 1,
      now: NOW,
    });
    expect(nearby[0]).toMatchObject({
      trackId: "pl",
      reason: { code: "near_you", countryCode: "PL" },
    });
    const fresh = rankFeed(pool, EMPTY_TASTE, { mode: "new", size: 3, seed: 1, now: NOW });
    expect(fresh[0]).toMatchObject({ trackId: "today", reason: { code: "new_release" } });
  });

  it("excludes what the session already showed", () => {
    const pool = [candidate("a"), candidate("b")];
    const feed = rankFeed(pool, EMPTY_TASTE, {
      mode: "for_you",
      size: 5,
      seed: 1,
      now: NOW,
      exclude: new Set(["a"]),
    });
    expect(feed.map((item) => item.trackId)).toEqual(["b"]);
  });
});

describe("progress", () => {
  it("diversity grows with even spread over many genres", () => {
    expect(diversity([])).toBe(0);
    expect(diversity([40])).toBe(0);
    expect(diversity([10, 10])).toBeCloseTo(Math.log(2) / Math.log(12));
    expect(diversity(Array.from({ length: 12 }, () => 3))).toBeCloseTo(1);
    expect(diversity([30, 1, 1])).toBeLessThan(diversity([10, 10, 10]));
  });

  it("Discovery Score rewards points, and diversity on top", () => {
    expect(discoveryScore(0, [])).toBe(0);
    expect(discoveryScore(1000, [100])).toBe(800);
    expect(
      discoveryScore(
        1000,
        Array.from({ length: 12 }, () => 1),
      ),
    ).toBe(1000);
  });

  it("levels have names, then numbers", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: "new_listener", progress: 0 });
    expect(levelFor(250)).toMatchObject({ level: 2, title: "explorer", floor: 100, next: 400 });
    expect(levelFor(20_000)).toMatchObject({ level: 8, title: "global_explorer", next: 35_000 });
    expect(levelFor(80_000)).toMatchObject({ level: 12, title: "global_explorer", floor: 80_000 });
  });

  it("goals follow the listener's pace within bounds", () => {
    const base = {
      today_songs: 7,
      today_artists: 4,
      week_artists: 18,
      week_countries: 3,
      avg_daily_songs: null,
      avg_daily_artists: null,
      avg_weekly_artists: null,
      avg_weekly_countries: null,
    };
    expect(goalsFor(base).map((g) => [g.key, g.target, g.value])).toEqual([
      ["daily_artists", 5, 4],
      ["daily_songs", 10, 7],
      ["weekly_countries", 5, 3],
      ["weekly_artists", 25, 18],
    ]);
    const busy = goalsFor({ ...base, avg_daily_songs: 40, avg_daily_artists: 0.5 });
    expect(busy.find((g) => g.key === "daily_songs")!.target).toBe(30);
    expect(busy.find((g) => g.key === "daily_artists")!.target).toBe(3);
    expect(goalsFor({ ...base, today_artists: 5 })[0]!.done).toBe(true);
  });

  it("the preview is the soundcheck, else 30 s from a third in", () => {
    expect(previewWindow(200_000, 60_000, 20_000)).toEqual({
      startMs: 60_000,
      lengthMs: 20_000,
      chosen: true,
    });
    expect(previewWindow(180_000, null, null)).toEqual({
      startMs: 59_000,
      lengthMs: 30_000,
      chosen: false,
    });
    // No choice: the analysed best moment; the artist's choice still wins over it.
    expect(previewWindow(180_000, null, null, 72_000)).toEqual({
      startMs: 72_000,
      lengthMs: 30_000,
      chosen: false,
    });
    expect(previewWindow(180_000, 10_000, 30_000, 72_000).startMs).toBe(10_000);
    // A suggestion that would run past the end is ignored.
    expect(previewWindow(180_000, null, null, 170_000).startMs).toBe(59_000);
    expect(previewWindow(20_000, null, null)).toEqual({
      startMs: 0,
      lengthMs: 20_000,
      chosen: false,
    });
    expect(previewWindow(null, null, null)).toEqual({
      startMs: 0,
      lengthMs: 30_000,
      chosen: false,
    });
  });
});

describe("tuneWeights", () => {
  const base = MODE_WEIGHTS.for_you;
  const outcome = (reason: string, shown: number, hits: number, completes = 0) => ({
    reason,
    shown,
    hits,
    completes,
    skips: 0,
  });

  it("leaves weights alone without enough history", () => {
    const tuned = tuneWeights(base, [outcome("genre_you_like", 10, 5)]);
    expect(tuned.weights).toBe(base);
    expect(tuned.factors).toEqual({});
  });

  it("leaves weights alone when nothing ever worked (no rate to compare with)", () => {
    expect(tuneWeights(base, [outcome("genre_you_like", 80, 0)]).factors).toEqual({});
  });

  it("boosts the signal that works and dampens the one that does not", () => {
    const tuned = tuneWeights(base, [
      outcome("listeners_like_you", 60, 18),
      outcome("genre_you_like", 60, 2),
      outcome("new_genre", 20, 2),
    ]);
    expect(tuned.weights.user).toBeGreaterThan(base.user);
    expect(tuned.weights.genre).toBeLessThan(base.genre);
    // Untouched: no reason maps to it.
    expect(tuned.weights.skip).toBe(base.skip);
    expect(tuned.weights.seen).toBe(base.seen);
  });

  it("is a nudge: factors stay within the configured bounds", () => {
    const tuned = tuneWeights(base, [outcome("rising", 500, 500), outcome("popular", 500, 0)]);
    expect(tuned.factors.rising).toBeLessThanOrEqual(TUNING.maxFactor);
    expect(tuned.factors.popularity).toBe(TUNING.minFactor);
  });

  it("shrinks little evidence toward the listener's overall rate", () => {
    const few = tuneWeights(base, [outcome("rising", 3, 3), outcome("popular", 100, 30)]);
    const many = tuneWeights(base, [outcome("rising", 60, 60), outcome("popular", 100, 30)]);
    expect(few.factors.rising ?? 1).toBeLessThan(many.factors.rising ?? 1);
  });

  it("pools reasons that stand for the same feature and counts finished previews", () => {
    const tuned = tuneWeights(base, [
      outcome("followed_artist", 30, 6),
      outcome("artist_you_like", 30, 0, 12),
      outcome("popular", 60, 2),
    ]);
    expect(tuned.factors.artist).toBeGreaterThan(1);
    expect(tuned.factors.popularity).toBeLessThan(1);
  });
});

describe("seasons", () => {
  it("are calendar quarters in UTC", () => {
    expect(currentSeason(new Date("2026-10-08T05:00:00Z"))).toEqual({
      year: 2026,
      quarter: 4,
      endsAt: new Date("2027-01-01T00:00:00Z"),
    });
    expect(currentSeason(new Date("2026-03-31T23:59:59Z")).quarter).toBe(1);
  });

  it("name a closed season from its first day", () => {
    expect(seasonOf("2026-07-01")).toEqual({ year: 2026, quarter: 3 });
    expect(seasonOf("2027-01-01")).toEqual({ year: 2027, quarter: 1 });
  });
});

describe("journeys", () => {
  const pool = [
    candidate("big", { listeners30d: 50_000, artistId: "a-big" }),
    candidate("small", { listeners30d: 40, artistId: "a-small" }),
    candidate("known", { listeners30d: 30, artistId: "a-known" }),
    candidate("de", { countryCode: "DE", artistId: "a-de", genreIds: [7] }),
    candidate("fresh", { publishAt: daysAgo(2), artistId: "a-fresh" }),
  ];
  const me = taste({
    artists: new Map([["a-known", 5]]),
    genres: new Map([[1, 4]]),
    country: "PL",
    heard: new Set(["heard"]),
  });

  it("underground keeps small artists the listener does not know, then fills from the feed", () => {
    const items = rankJourney("underground", pool, me, { size: 2, seed: 1, now: NOW });
    expect(items[0]?.trackId).not.toBe("big");
    expect(items.map((i) => i.trackId)).not.toContain("known");
    expect(rankJourney("underground", pool, me, { size: 5, seed: 1, now: NOW })).toHaveLength(5);
  });

  it("outside my taste avoids genres I like; global leaves my country; something new is recent", () => {
    expect(rankJourney("outside_taste", pool, me, { size: 1, seed: 1, now: NOW })[0]?.trackId).toBe(
      "de",
    );
    expect(rankJourney("global", pool, me, { size: 1, seed: 1, now: NOW })[0]?.trackId).toBe("de");
    expect(rankJourney("something_new", pool, me, { size: 1, seed: 1, now: NOW })[0]?.trackId).toBe(
      "fresh",
    );
  });

  it("daily picks only unheard songs; weekly labels sections without repeats", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      candidate(`t${i}`, {
        artistId: `a${i % 12}`,
        genreIds: [i % 5],
        listeners30d: i * 400,
        publishAt: daysAgo(i),
      }),
    );
    const daily = pickDaily([...many, candidate("heard")], me, 3, NOW);
    expect(daily).toHaveLength(10);
    expect(daily.map((d) => d.trackId)).not.toContain("heard");
    const weekly = pickWeekly(many, me, 3, NOW);
    expect(new Set(weekly.map((w) => w.trackId)).size).toBe(weekly.length);
    expect(new Set(weekly.map((w) => w.section))).toEqual(
      new Set(["new", "new_artists", "underground", "trending", "outside"]),
    );
  });

  it("period seeds are stable per listener and period", () => {
    expect(periodSeed("u1", "2026-10-08")).toBe(periodSeed("u1", "2026-10-08"));
    expect(periodSeed("u1", "2026-10-08")).not.toBe(periodSeed("u1", "2026-10-09"));
  });
});

describe("why this song", () => {
  const facts = {
    artist: "Hałda",
    genre: "Indie",
    country: "Poland",
    listeners30d: 8000,
    listeners7d: 10,
    listenersPrev7d: 2,
    completionRate: 0.72,
    ageDays: 3,
  };

  it("explains the real signal, with numbers only when they are real", () => {
    expect(explain({ code: "genre_you_like", genreId: 1 }, facts)[0]).toEqual({
      key: "genre_you_like",
      values: { artist: "Hałda", genre: "Indie", country: "Poland" },
    });
    expect(explain({ code: "loved_by_listeners" }, facts)[0]?.values.percent).toBe(72);
    expect(explain({ code: "loved_by_listeners" }, { ...facts, listeners30d: 2 })[0]?.key).toBe(
      "loved_by_listeners_plain",
    );
  });

  it("adds that an artist is small, or that a song is growing fast", () => {
    expect(
      explain({ code: "popular" }, { ...facts, listeners30d: 20_000 }).map((l) => l.key),
    ).toEqual(["popular", "growing"]);
    expect(explain({ code: "new_release" }, facts).at(-1)).toEqual({
      key: "small",
      values: { listeners: 8000 },
    });
  });
});
