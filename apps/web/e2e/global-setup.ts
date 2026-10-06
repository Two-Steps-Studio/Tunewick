import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates closed-beta invite codes for the E2E run (requires local Supabase).
 * Values set on process.env here are visible to the test workers.
 */
export default async function globalSetup() {
  const status = execSync("pnpm exec supabase status -o env", {
    // Playwright runs from apps/web; the Supabase project lives at the repository root.
    cwd: resolve(process.cwd(), "..", ".."),
    encoding: "utf8",
  });
  const read = (key: string) => status.match(new RegExp(`^${key}="?(.*?)"?$`, "m"))?.[1];
  const url = read("API_URL");
  const secret = read("SECRET_KEY");
  if (!url || !secret) throw new Error("Local Supabase is not running (pnpm db:start).");

  const supabase = createClient(url, secret, { auth: { persistSession: false } });
  const shared = `E2E-${randomUUID()}`;
  const singleUse = `E2E-ONCE-${randomUUID()}`;

  for (const [code, maxUses] of [
    [shared, 1000],
    [singleUse, 1],
  ] as const) {
    const { error } = await supabase.rpc("create_access_invites", {
      codes: [code],
      max_uses: maxUses,
      label: "e2e",
    });
    if (error) throw error;
  }

  process.env.E2E_SUPABASE_URL = url;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = read("PUBLISHABLE_KEY") ?? "";
  process.env.E2E_INVITE_CODE = shared;
  process.env.E2E_SINGLE_USE_INVITE = singleUse;
}
