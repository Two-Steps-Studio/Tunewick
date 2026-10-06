// Creates promo codes server-side (secret key) until the admin panel exists (M9.3). The campaign
// is created when missing. Plaintext codes are printed ONCE — only hashes are stored.
//
// Unique single-use codes:  node scripts/create-promo-codes.mjs --local --campaign "Beta 2026" --count 50 --days 90
// Shared poster code:       node scripts/create-promo-codes.mjs --local --campaign "Katofonia" --code KATOFONIA26 --max-uses 200 --days 30
// Benefits: --days N | --months N | --lifetime.  Options: --expires 2027-01-31, --new-accounts-days 30, --csv out.csv
// Production: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/create-promo-codes.mjs ...
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const int = (name) => (arg(name) === undefined ? undefined : Number(arg(name)));

const campaign = arg("campaign");
const benefit = args.includes("--lifetime")
  ? { type: "premium_lifetime", value: null }
  : arg("months")
    ? { type: "premium_months", value: int("months") }
    : { type: "premium_days", value: int("days") };
if (!campaign || (benefit.type !== "premium_lifetime" && !Number.isInteger(benefit.value))) {
  throw new Error(
    'Usage: --campaign "name" (--days N | --months N | --lifetime) [--count N | --code TEXT --max-uses N] [--expires YYYY-MM-DD] [--new-accounts-days N] [--csv file] [--local]',
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

const eligibility = arg("new-accounts-days") ? { new_accounts_days: int("new-accounts-days") } : {};
const supabase = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("system_create_promo_codes", {
  campaign_name: campaign,
  benefit_type: benefit.type,
  benefit_value: benefit.value,
  how_many: int("count") ?? 1,
  shared_code: arg("code") ?? null,
  max_uses: int("max-uses") ?? null,
  expires_at: arg("expires") ? new Date(`${arg("expires")}T23:59:59+01:00`).toISOString() : null,
  eligibility,
});
if (error) throw error;

const csv = arg("csv");
if (csv) {
  writeFileSync(csv, `code,campaign\n${data.map((code) => `${code},"${campaign}"`).join("\n")}\n`);
  console.error(`${data.length} code(s) written to ${csv}. They cannot be shown again.`);
} else {
  console.log(data.join("\n"));
}
