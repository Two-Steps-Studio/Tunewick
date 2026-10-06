// Generates closed-beta access invite codes (decision D5). Codes are printed ONCE; the database
// stores only their SHA-256 hashes.
//
// Local:      node scripts/create-invites.mjs --local --count 10
// Production: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/create-invites.mjs --count 50 \
//               --max-uses 1 --expires-days 30 --label "GZM artists"
import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const count = Number(arg("count", "1"));
const maxUses = Number(arg("max-uses", "1"));
const expiresDays = arg("expires-days", null);
const label = arg("label", null);

if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("--count must be 1–1000");
if (!Number.isInteger(maxUses) || maxUses < 1) throw new Error("--max-uses must be >= 1");

let url = process.env.SUPABASE_URL;
let secret = process.env.SUPABASE_SECRET_KEY;
if (args.includes("--local")) {
  const status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const read = (key) => status.match(new RegExp(`^${key}="?(.*?)"?$`, "m"))?.[1];
  url = read("API_URL");
  secret = read("SECRET_KEY");
}
if (!url || !secret) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY, or use --local.");

// 12 characters from an unambiguous alphabet (no 0/O, 1/I/L): ~59 bits of entropy.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = () => {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
};

const codes = Array.from({ length: count }, code);
const expiresAt = expiresDays
  ? new Date(Date.now() + Number(expiresDays) * 86_400_000).toISOString()
  : null;

const supabase = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("create_access_invites", {
  codes,
  max_uses: maxUses,
  expires_at: expiresAt,
  label,
});
if (error) throw error;

console.log(`Created ${data} invite(s)${expiresAt ? `, valid until ${expiresAt}` : ""}:`);
for (const c of codes) console.log(c);
