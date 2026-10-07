import { describe, expect, it } from "vitest";
import { countryName, flagEmoji, formatListening, languageName, songSegment } from "./intl";
import { slugify } from "./slug";

describe("intl helpers", () => {
  it("names countries and languages in the interface language", () => {
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("DE", "pl")).toBe("Niemcy");
    expect(languageName("pl", "en")).toBe("Polish");
    expect(languageName("en", "pl")).toBe("Angielski");
  });

  it("builds flags only from valid codes", () => {
    expect(flagEmoji("PL")).toBe("🇵🇱");
    expect(flagEmoji("pl")).toBe("");
  });

  it("formats listening time", () => {
    expect(formatListening(42 * 60_000 + 59_000)).toBe("42m");
    expect(formatListening(20_000)).toBe("<1m");
    expect(formatListening(0)).toBe("0m");
    expect(formatListening((14 * 60 + 32) * 60_000)).toBe("14h 32m");
  });

  it("song URLs keep the code and a readable title", () => {
    expect(songSegment("Zażółć gęślą", "ab2cd3ef4g", slugify)).toBe("zazolc-gesla-ab2cd3ef4g");
    expect(songSegment("???", "ab2cd3ef4g", slugify)).toBe("ab2cd3ef4g");
  });
});
