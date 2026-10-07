import { describe, expect, it } from "vitest";
import {
  diversity,
  discoveryScore,
  EMPTY_TASTE,
  goalsFor,
  levelFor,
  previewWindow,
  rankFeed,
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
    expect(discoveryScore(100, [100])).toBe(800);
    expect(
      discoveryScore(
        100,
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
