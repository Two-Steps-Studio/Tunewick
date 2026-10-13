import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ supabaseConfig: () => ({ url: "", publishableKey: "" }) }));
const { verifyPathFor } = await import("./session");

describe("verifyPathFor", () => {
  it("sends every language to its own second-factor page", () => {
    expect(verifyPathFor("/ustawienia")).toBe("/weryfikacja");
    expect(verifyPathFor("/en/settings")).toBe("/en/verify");
    expect(verifyPathFor("/de/charts")).toBe("/de/verify");
    expect(verifyPathFor("/pt")).toBe("/pt/verify");
  });
});
