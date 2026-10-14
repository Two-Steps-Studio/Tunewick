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
   WebAuthn (passkeys): enroll **and** verify enabled; relying party ID = the site's host
   (`tunewick.vercel.app`, later the own domain), origins = `https://<that host>`, display name
   `Tunewick`. A passkey is bound to its host: after a domain change users add passkeys again (the
   authenticator app keeps working). Phone MFA off (SMS costs per message and is phishable).
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

Without a terminal: GitHub → Actions → **Database migrations** → Run workflow (from `main`).
First with `apply` off — it lists applied and pending migrations and does a dry run — then with
`apply` on. It needs repository (or `production` environment) secrets `SUPABASE_ACCESS_TOKEN`
(supabase.com → Account → Access Tokens), `SUPABASE_DB_PASSWORD` (§1) and `SUPABASE_PROJECT_REF`
(the id in `https://<ref>.supabase.co`). Add required reviewers to the `production` environment to
make every run wait for approval.

Without GitHub secrets either: `node scripts/build-migration-bundle.mjs > bundle.sql` builds one
script for Supabase → **SQL Editor**. It applies only the migrations missing from
`supabase_migrations.schema_migrations` and records them as the CLI does (so `db push` keeps
working), runs as a single transaction (a failure changes nothing) and is safe to run again. It
refuses a database that has the tables but no migration records.

Order with a release that needs new tables: migrations first, then promote the Vercel deployment
(an app built for a newer schema fails on an older database).

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

### Public address (SEO)

Set `NEXT_PUBLIC_SITE_URL` (Production) to the public domain, e.g. `https://tunewick.com`, and
redeploy. Canonical URLs, hreflang alternates, `sitemap.xml`, `robots.txt`, link previews and
structured data (schema.org JSON-LD for artists, releases, songs and venue events) use it.
Without it the Vercel production domain is used. After the domain is live, submit
`https://<domain>/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

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

   The web app also accepts Cloudflare's usual names when the `MEDIA_*` ones are absent:
   `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (the ingest bucket),
   `R2_REGION`, `R2_MEDIA_BUCKET`; an endpoint copied with the bucket appended works too. The audio
   worker (§3b) reads only the `MEDIA_*` names.

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

   **Pay only while it works.** `fly.toml` runs `worker --idle-exit 120 --http-port 8080`: after two
   minutes without work the worker exits and the machine stops. The database wakes it with one HTTP
   request to `https://<app>.fly.dev/wake` when a master, image, share clip or storage deletion is
   queued (at most every 20 s) and once an hour for retries and backfills
   (`20261012100000_worker_wake.sql`). After the first deploy, run once in the SQL Editor:
   `update private.worker_wake set url = 'https://tunewick-audio.fly.dev/wake';` (the workflow
   summary shows the exact line). Without a URL nothing is sent, so always-on workers (TrueNAS,
   local) are unaffected. Anyone who calls the URL can only start the worker for two idle minutes.
   One shared-cpu machine with 2 GB RAM is enough for the beta; more machines can run side by side
   (jobs are claimed with `FOR UPDATE SKIP LOCKED`).
   Without a terminal: add repository secrets `FLY_API_TOKEN` (fly.io → Account → Access Tokens),
   `SUPABASE_SECRET_KEY`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
   `R2_BUCKET_NAME`, then GitHub → Actions → **Deploy audio worker** → Run workflow. It creates the
   Fly app on the first run (`services/audio-worker/fly.toml`), sets the worker's secrets from
   those and deploys. Re-run it after worker changes.
   **Own server instead of Fly (e.g. TrueNAS SCALE 24.10+ or any Docker host):** the "Audio
   worker image" workflow publishes `ghcr.io/two-steps-studio/tunewick-audio:latest` on every
   change to `services/audio-worker` on `main` (or run it by hand). On TrueNAS: Apps → Discover
   Apps → ⋮ → **Install via YAML**, paste `services/audio-worker/truenas.yaml` and fill in the
   marked values. No inbound ports are needed. The package is private by default: either make it
   public (GitHub → Packages → tunewick-audio → Package settings → Change visibility; the image
   holds no secrets) or log the host in with a token that has `read:packages`
   (`docker login ghcr.io`). Elsewhere: `docker compose -f truenas.yaml up -d`.
   **Automatic updates on TrueNAS:** System → Advanced Settings → Cron Jobs → Add. Command
   `midclt call -job app.pull_images tunewick-audio '{"redeploy": true}'`, Run As User `root`,
   schedule e.g. daily at 04:00 (`0 4 * * *`). It pulls the newest image and restarts the app
   only when the image changed. Test it once with **Run Now**, then check
   `sudo docker ps --filter name=tunewick` (fresh "Up" time) and
   `sudo docker logs --tail 15 ix-tunewick-audio-worker-1`.
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
4. Optional Premium for beta testers (Lossless/Hi-Res), audited:

   ```bash
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/grant-plan.mjs --email <tester> --days 90 --source beta --note "beta 2026"
   ```
5. Promo codes (until the admin panel exists). Codes are printed once — use `--csv` and keep the
   file in the password manager / hand it to the partner; only hashes stay in the database:

   ```bash
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/create-promo-codes.mjs --campaign "Beta 2026" --count 50 --days 90 --csv beta-codes.csv
   ```

## 5. Checklist after each deploy

- `/` and `/en` load; `/logowanie` shows the form.
- Sign-up email arrives and the link lands on `/api/auth/confirm` → signed in.
- Vercel → Logs: no `error` level entries for the new deployment.

## 6. Discovery expansion (M13)

- Scheduled through **pg_cron** by migrations `20261008120000_discovery_progress_feed` and
  `20261008150000_seasons_challenges` (enable the extension in the Supabase project if it is off,
  then re-run the `do` blocks of those migrations): feed aggregates refresh every 5 minutes
  (`private.refresh_discovery_stats()`), product events older than 180 days are pruned daily, the
  last season (quarter) is closed daily at 00:20 UTC (`private.close_last_season()`, a no-op once
  closed). Listening partitions come from M11.7.
  Check: `select jobname, schedule from cron.job;`
- Share cards and Open Graph images are rendered by the web app (`next/og`); covers are converted
  from WebP with `sharp` (an explicit dependency of `apps/web`).
- The audio worker also renders share videos (`share_clips` queue): no new settings — it uses the
  same Supabase key and buckets; the app writes cards into the ingest bucket with its own S3 keys.
- The worker also empties the storage sweep (`private.storage_deletions`): its S3 key needs
  DeleteObject on both buckets. Entries failing five times stay in the table — check
  `select * from private.storage_deletions where attempts >= 5;` now and then.
- Point values and caps: edit `discovery_point_rules` (admin) — no deploy needed. Weekly
  challenges: `discovery_challenges` (enable/disable or change targets between weeks; the running
  week's three are picked from the enabled ones).

## Error reports

Server errors (`apps/web/src/instrumentation.ts`, Next's `onRequestError`) and uncaught browser
errors (`ErrorReporter` in the shell, the segment error boundary) go to `private.app_errors`
through `public.report_error`. Admin → **App errors** lists the last 7 days, most recent first.
Grouped per error and day with a counter, at most 500 different errors a day (a flood cannot grow
the table), no user id, no IP, paths without their query string; a pg_cron job deletes rows
older than 30 days. Browser extension errors and known harmless noise are not sent; a page sends
at most five reports.
