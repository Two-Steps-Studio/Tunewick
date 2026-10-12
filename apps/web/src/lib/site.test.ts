import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Localized paths come from next-intl's navigation, which needs the Next runtime.
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    locale === "pl" ? href : `/${locale}${href}`,
}));
const { alternates, jsonLd } = await import("./site");

describe("jsonLd", () => {
  it("adds the schema.org context and cannot close its script tag", () => {
    const { __html } = jsonLd({ "@type": "MusicGroup", name: "</script><b>x" });
    expect(JSON.parse(__html)).toMatchObject({
      "@context": "https://schema.org",
      name: "</script><b>x",
    });
    expect(__html).not.toContain("</script>");
  });
});

describe("alternates", () => {
  it("lists every language and sends other visitors to English", () => {
    const result = alternates("/charts", "de");
    expect(result?.canonical).toBe("http://localhost:3000/de/charts");
    expect(Object.keys(result?.languages ?? {})).toEqual([
      "pl",
      "en",
      "de",
      "es",
      "fr",
      "pt",
      "x-default",
    ]);
    expect(result?.languages?.["x-default" as "en"]).toBe("http://localhost:3000/en/charts");
  });
});
