// Grants a platform role server-side (secret key) — used to bootstrap the first admin.
// The grant is written to the audit log as a "system" action. Afterwards admins grant roles in
// the app (public.admin_grant_role requires admin + MFA).
//
// Local:      node scripts/grant-role.mjs --local --email admin@example.com --role admin
// Production: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/grant-role.mjs --email ... --role admin
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const email = arg("email");
const role = arg("role");
if (!email || !["admin", "moderator"].includes(role ?? "")) {
  throw new Error("Usage: --email <address> --role admin|moderator [--local]");
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
const { data, error } = await supabase.rpc("system_grant_role", { target_email: email, role });
if (error) throw error;
console.log(
  `Granted ${role} to user ${data}. The user must set up two-factor sign-in to act as staff.`,
);
