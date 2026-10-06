// Grants a plan server-side (secret key): beta testers, support, local testing. Audited as a
// "system" action. Admins with MFA use public.admin_grant_entitlement instead.
//
// Local:      node scripts/grant-plan.mjs --local --email listener@example.com --days 30
// Lifetime:   node scripts/grant-plan.mjs --local --email listener@example.com --lifetime
// Production: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/grant-plan.mjs --email ... --days 90 --source beta --note "beta 2026"
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const email = arg("email");
const plan = arg("plan") ?? "premium";
const source = arg("source") ?? "admin";
const note = arg("note") ?? "granted with scripts/grant-plan.mjs";
const lifetime = args.includes("--lifetime");
const days = lifetime ? null : Number(arg("days"));
if (!email || (!lifetime && !(Number.isInteger(days) && days > 0))) {
  throw new Error(
    "Usage: --email <address> (--days N | --lifetime) [--plan premium] [--source admin|beta] [--note text] [--local]",
  );
}

let url = process.env.SUPABASE_URL;
let secret = process.env.SUPABASE_SECRET_KEY;
if (args.includes("--local")) {
  const status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const read = (key) => status.match(new RegExp(`^${key}="?(.*?)"?$`, "m"))?.[1];
  url = read("API_URL");
  secret = read("SECRET_KEY");
}
if (!url || !secret) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY, or use --local.");

const supabase = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("system_grant_entitlement", {
  target_email: email,
  plan,
  days,
  source,
  note,
});
if (error) throw error;
console.log(`Granted ${plan} ${lifetime ? "for life" : `for ${days} days`} (entitlement ${data}).`);
