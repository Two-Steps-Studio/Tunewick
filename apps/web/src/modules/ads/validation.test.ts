import { describe, expect, it } from "vitest";
import { adCampaignSchema } from "./validation";

const base = {
  advertiser: "Klub Hałda",
  headline: "Koncerty w każdy piątek",
  body: "",
  cta: "Zobacz",
  url: "https://example.com/koncerty",
  release: "",
  placements: ["scene"],
  locales: [],
  weight: "1",
  startsOn: "",
  endsOn: "",
};

describe("adCampaignSchema", () => {
  it("accepts an external sponsor", () => {
    expect(adCampaignSchema.safeParse(base).success).toBe(true);
  });
  it("accepts a promoted release instead of a link", () => {
    expect(adCampaignSchema.safeParse({ ...base, url: "", release: "zespol/plyta" }).success).toBe(
      true,
    );
  });
  it("needs exactly one destination", () => {
    expect(adCampaignSchema.safeParse({ ...base, release: "zespol/plyta" }).success).toBe(false);
    expect(adCampaignSchema.safeParse({ ...base, url: "" }).success).toBe(false);
  });
  it("refuses plain http, no placement and an end before the start", () => {
    expect(adCampaignSchema.safeParse({ ...base, url: "http://example.com" }).success).toBe(false);
    expect(adCampaignSchema.safeParse({ ...base, placements: [] }).success).toBe(false);
    expect(
      adCampaignSchema.safeParse({ ...base, startsOn: "2026-11-02", endsOn: "2026-11-01" }).success,
    ).toBe(false);
  });
});
