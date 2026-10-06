# Deployment runbook

> Production = `main` on Vercel + a Supabase project in the EU. Previews = `work` and PR branches.
> Secrets are never committed and never pasted into chats or issues; they live in Vercel / Supabase
> / a password manager only.

Until the variables in §3 are set, every page answers **503 "not configured yet"** (by design,
see `apps/web/src/proxy.ts`) instead of a bare 500.

## 1. Supabase project (once)

1. supabase.com → **New project** in the Tunewick organisation.
   - Name `tunewick-prod`, region **Central EU (Frankfurt)** (GDPR, decision D3).
   - Generate a strong database password and store it in the password manager.
2. **Authentication → Sign In / Providers → Email**
   - Enable email provider, **Confirm email: ON**, **Secure email change: ON**,
     **Secure password change: ON**.
   - Minimum password length **10**.
   - Anonymous sign-ins **OFF**, manual linking **OFF**.
3. **Authentication → Multi-Factor** → TOTP (authenticator app): enroll **and** verify enabled.
   Phone MFA off.
4. **Authentication → URL Configuration**
   - Site URL: the production domain, e.g. `https://tunewick.vercel.app` (later the custom
     domain).
   - Redirect URLs: `https://<production-domain>/**` and, for previews,
     `https://*-<vercel-team-slug>.vercel.app/**`.
5. **Authentication → Emails → Templates** (the app relies on `token_hash` links, docs/security.md
   §2 — the default templates will not work):
   - *Confirm signup*: subject and body from `supabase/templates/confirmation.html`
     (subject in `supabase/config.toml`).
   - *Reset password*: from `supabase/templates/recovery.html`.
6. **Authentication → Emails → SMTP**: the built-in mailer only delivers to project team members
   and is heavily rate limited, so beta invites need a real SMTP provider (EU region preferred,
   e.g. Resend EU / Brevo / Amazon SES eu-central-1). Sender `no-reply@<domain>` with SPF/DKIM.
   Then set **Rate limits → emails per hour** to a sane value (e.g. 60).

## 2. Database schema

Migrations are the source of truth (`supabase/migrations`). From the repo root:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```

`link` asks for the database password from §1. `db push` lists the migrations before applying
them. Never edit production schema in the dashboard — write a migration instead.

## 3. Vercel project

Settings → General: Root Directory `apps/web`, framework Next.js, "Include files outside the root
directory" **ON**, Node 22.x. Functions region `fra1`. Production branch `main`.

Settings → Environment Variables (Production **and** Preview):

| Name | Value | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (Settings → API) | no, public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key | no, public |

`NEXT_PUBLIC_*` values are inlined at build time → after adding or changing them, **Redeploy**
(Deployments → latest → Redeploy). No secret key is needed by the web app today; if one is added
later it must not use the `NEXT_PUBLIC_` prefix (`pnpm check:client-bundle` guards this).

## 3a. Cloudflare R2 (audio masters)

Until these variables exist the editor says "audio upload is coming soon" — nothing breaks.

1. Cloudflare → R2 → create bucket **`tunewick-ingest`** (location hint: Eastern Europe / EU
   jurisdiction). It holds the masters artists upload; never public.
2. Bucket → Settings → **CORS policy** (the browser uploads straight to R2 with a presigned URL):

   ```json
   [
     {
       "AllowedOrigins": ["https://<production-domain>", "https://*-<vercel-team-slug>.vercel.app"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
3. R2 → Manage API tokens → **Create API token**: permission *Object Read & Write*, scoped to the
   `tunewick-ingest` bucket only. Store the access key and secret in the password manager.
4. Vercel → Environment Variables (Production and Preview), **server-only, never `NEXT_PUBLIC_`**:

   | Name | Value |
   | --- | --- |
   | `MEDIA_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` (EU jurisdiction: `https://<account-id>.eu.r2.cloudflarestorage.com`) |
   | `MEDIA_S3_REGION` | `auto` |
   | `MEDIA_S3_ACCESS_KEY_ID` | token access key |
   | `MEDIA_S3_SECRET_ACCESS_KEY` | token secret (mark *Sensitive*) |
   | `MEDIA_INGEST_BUCKET` | `tunewick-ingest` |

   Redeploy. Locally the same variables point at `pnpm media:start` (SeaweedFS).

## 3b. Audio worker (Fly.io, EU)

1. R2: second bucket **`tunewick-media`** for the delivery variants (private). Add a CORS rule
   with `"AllowedMethods": ["GET", "HEAD"]` and `"AllowedHeaders": ["range"]` for the same origins
   (members preview their processed tracks through short-lived presigned URLs). Extend the API
   token (or create a second one) to *Object Read & Write* on both buckets.
2. Vercel: add `MEDIA_BUCKET=tunewick-media` (server-only) and redeploy.
3. Fly.io: `fly launch --no-deploy` in `services/audio-worker` (region `waw` or `fra`), then
   `fly secrets set` for:

   | Name | Value |
   | --- | --- |
   | `TUNEWICK_SUPABASE_URL` | Supabase project URL |
   | `TUNEWICK_SUPABASE_SECRET_KEY` | Supabase **secret** key (`sb_secret_…`) — server only |
   | `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` | as in §3a |
   | `MEDIA_INGEST_BUCKET` / `MEDIA_BUCKET` | `tunewick-ingest` / `tunewick-media` |

   Process command: `worker --poll 5` (the image entrypoint is `python -m tunewick_audio`).
   One shared-cpu machine with 2 GB RAM is enough for the beta; more machines can run side by side
   (jobs are claimed with `FOR UPDATE SKIP LOCKED`).
4. Check: upload a master in the editor → within a minute the track shows "Gotowe" (ready) and
   the *Listen* button plays it. Worker logs: `fly logs` (one JSON line per job).

## 4. Bootstrap (once)

Run locally with the secret key in the shell environment only (Settings → API → secret key):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> node scripts/create-invites.mjs --count 1 --label owner
```

On Windows PowerShell set the variables first: `$env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SECRET_KEY="<secret>"`,
then run `node scripts/create-invites.mjs ...` in the same window.

1. Register with that invite code, confirm the email.
2. Grant admin, then enable TOTP in Settings → Security (staff tools require MFA):

   ```bash
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/grant-role.mjs --email <owner-email> --role admin
   ```
3. Create beta invites in batches (`--count 50 --max-uses 1 --expires-days 30 --label "beta artists"`).
   Codes are printed once; only hashes are stored.

## 5. Checklist after each deploy

- `/` and `/en` load; `/logowanie` shows the form.
- Sign-up email arrives and the link lands on `/api/auth/confirm` → signed in.
- Vercel → Logs: no `error` level entries for the new deployment.
