import { describe, expect, it } from "vitest";
import {
  artistDbError,
  artistReachSchema,
  linkKind,
  createArtistSchema,
  slugify,
  updateArtistSchema,
  verificationSchema,
} from "./validation";

describe("slugify", () => {
  it("turns Polish names into profile addresses", () => {
    expect(slugify("Zespół Ćma & Łoś")).toBe("zespol-cma-los");
    expect(slugify("  --Kolektyw  GZM-- ")).toBe("kolektyw-gzm");
  });
});

describe("createArtistSchema", () => {
  it("normalizes the slug and rejects invalid ones", () => {
    expect(createArtistSchema.parse({ name: "Ćma", slug: " CMA " }).slug).toBe("cma");
    expect(createArtistSchema.safeParse({ name: "Ćma", slug: "ćma" }).success).toBe(false);
    expect(createArtistSchema.safeParse({ name: " ", slug: "cma" }).success).toBe(false);
  });
});

describe("updateArtistSchema", () => {
  it("accepts an empty or a four-digit year", () => {
    expect(updateArtistSchema.parse({ name: "X", bio: "", formedYear: "" }).formedYear).toBeNull();
    expect(updateArtistSchema.parse({ name: "X", bio: "", formedYear: "2019" }).formedYear).toBe(
      2019,
    );
    expect(updateArtistSchema.safeParse({ name: "X", bio: "", formedYear: "19" }).success).toBe(
      false,
    );
    expect(updateArtistSchema.safeParse({ name: "X", bio: "", formedYear: "2150" }).success).toBe(
      false,
    );
  });
});

describe("verificationSchema", () => {
  it("accepts 1–5 https links, one per line", () => {
    const parsed = verificationSchema.parse({
      evidence: "https://zespol.example\n\n https://bandcamp.example/zespol ",
      note: "",
    });
    expect(parsed.evidence).toEqual(["https://zespol.example", "https://bandcamp.example/zespol"]);
    expect(parsed.note).toBeNull();
  });

  it("rejects missing, non-https or too many links", () => {
    expect(verificationSchema.safeParse({ evidence: "", note: "" }).success).toBe(false);
    expect(verificationSchema.safeParse({ evidence: "http://x.example", note: "" }).success).toBe(
      false,
    );
    const six = Array.from({ length: 6 }, (_, i) => `https://x${i}.example`).join("\n");
    expect(verificationSchema.safeParse({ evidence: six, note: "" }).success).toBe(false);
  });
});

describe("artistDbError", () => {
  it("maps constraint violations", () => {
    expect(artistDbError({ code: "23505", message: "artists_slug_key" })).toEqual({
      field: "slug",
      code: "slugTaken",
    });
    expect(
      artistDbError({ code: "23505", message: "a verification request is already pending" }),
    ).toEqual({ code: "alreadyPending" });
    expect(artistDbError({ code: "P0002" })).toEqual({ field: "handle", code: "handleNotFound" });
    expect(
      artistDbError({ code: "23514", message: "an artist must keep at least one owner" }),
    ).toEqual({ code: "lastOwner" });
  });
});

describe("artist location", () => {
  it("accepts a voivodeship and a city, or nothing", () => {
    const base = { name: "X", bio: "", formedYear: "" };
    expect(
      updateArtistSchema.parse({ ...base, voivodeship: "podlaskie", city: " Suwałki " }),
    ).toMatchObject({
      voivodeship: "podlaskie",
      city: "Suwałki",
    });
    expect(updateArtistSchema.parse(base)).toMatchObject({ voivodeship: null, city: null });
  });

  it("refuses an unknown voivodeship and a too long city", () => {
    const base = { name: "X", bio: "", formedYear: "" };
    expect(updateArtistSchema.safeParse({ ...base, voivodeship: "gzm" }).success).toBe(false);
    expect(updateArtistSchema.safeParse({ ...base, city: "a".repeat(81) }).success).toBe(false);
  });
});

describe("artistReachSchema", () => {
  const base = {
    country: "DE",
    region: "Berlin",
    languages: "de, EN de",
    genres: ["3"],
    links: "",
  };

  it("accepts a country, languages as codes and up to five genres", () => {
    const parsed = artistReachSchema.parse(base);
    expect(parsed).toMatchObject({
      country: "DE",
      region: "Berlin",
      languages: ["de", "en"],
      genres: [3],
    });
    expect(artistReachSchema.parse({ ...base, country: "", region: "" })).toMatchObject({
      country: null,
      region: null,
    });
  });

  it("rejects names instead of codes and too many genres", () => {
    expect(artistReachSchema.safeParse({ ...base, languages: "Polish" }).success).toBe(false);
    expect(artistReachSchema.safeParse({ ...base, country: "Germany" }).success).toBe(false);
    expect(
      artistReachSchema.safeParse({ ...base, genres: ["1", "2", "3", "4", "5", "6"] }).success,
    ).toBe(false);
  });

  it("takes https links one per line and knows what they are", () => {
    const parsed = artistReachSchema.parse({
      ...base,
      links:
        "https://odkrycie.bandcamp.com\n\nhttps://www.instagram.com/odkrycie\nhttps://odkrycie.pl",
    });
    expect(parsed.links.map(linkKind)).toEqual(["bandcamp", "instagram", "website"]);
    expect(artistReachSchema.safeParse({ ...base, links: "http://insecure.example" }).success).toBe(
      false,
    );
  });
});
