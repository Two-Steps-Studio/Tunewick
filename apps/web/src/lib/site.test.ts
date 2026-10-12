import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { jsonLd } = await import("./site");

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
