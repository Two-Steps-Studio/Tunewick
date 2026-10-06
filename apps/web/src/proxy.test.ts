// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards against the matcher losing its escaped dot again (it once excluded every path
// longer than one character from the proxy). Next requires the matcher to be a literal in
// proxy.ts, so the test reads it from the source instead of importing the module.
const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
const literal = source.match(/matcher:\s*("(?:[^"\\]|\\.)*")/)?.[1];
const matcher = JSON.parse(literal ?? '""') as string;

function matches(pathname: string) {
  return new RegExp(`^${matcher}$`).test(pathname);
}

describe("proxy matcher", () => {
  it("is defined", () => {
    expect(matcher).not.toBe("");
  });

  it("runs on page paths in every locale", () => {
    for (const path of [
      "/",
      "/scena",
      "/biblioteka",
      "/en",
      "/en/scene",
      "/nie-ma-takiej-strony",
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("skips API routes, Next internals and files", () => {
    for (const path of [
      "/api/v1/playback",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/icons/icon-192.png",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
