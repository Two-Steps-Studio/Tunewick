import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./schema-version";

describe("SCHEMA_VERSION", () => {
  it("is the newest migration (update it with every new migration)", () => {
    const newest = readdirSync(join(__dirname, "../../../../supabase/migrations"))
      .filter((f) => /^\d{14}_.+\.sql$/.test(f))
      .sort()
      .at(-1)
      ?.slice(0, 14);
    expect(SCHEMA_VERSION).toBe(newest);
  });
});
