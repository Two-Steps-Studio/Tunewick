# Closed beta launch checklist

> Goal (D5/D6): a closed beta with invited small independent artists from all of Poland and their
> listeners. Each line is either **done in code** (✅, with where) or **owner / external** (☐).
> Nothing here is "done" until it is true in production.

## 1. Infrastructure

- ☐ Supabase project (EU, Frankfurt) — created; schema applied up to `20261006270000`.
  Remaining SQL, in order: `supabase-update-m8.sql`, `supabase-update-m11.sql` (files are produced
  locally; later the CLI `supabase db push` replaces this).
- ☐ Supabase Auth settings (deployment.md §1): email confirmation, password ≥ 10, TOTP on, URL
  configuration, **email templates** (token_hash links), **SMTP provider** (EU) — the built-in mailer
  only reaches project members.
- ☐ Vercel: production deploy of `main` after merging PR #4; env vars are set
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- ☐ Cloudflare R2: `tunewick-ingest` and `tunewick-media` buckets, CORS, scoped token; Vercel
  `MEDIA_*` vars (deployment.md §3a). Until then uploads say "coming soon".
- ☐ Fly.io audio worker in `waw`/`fra` with the secret key and R2 vars (deployment.md §3b).
- ☐ Monthly job: `select private.create_listening_partition((now() + interval '2 months')::date);`
  (pg_cron in Supabase, or a scheduled worker task). Partitions exist 15 months ahead of the
  migration date; rows fall into the default partition after that.
- ☐ Error monitoring (Sentry EU or equivalent) — needs an account; not wired yet.
- ☐ GitHub branch protection on `main`: required checks incl. `worker`.

## 2. People and access

- ☐ First admin: register with an invite, then `select public.system_grant_role('<email>', 'admin');`
  in the SQL editor, then turn on TOTP in Settings → Security.
- ✅ Invites: `scripts/create-invites.mjs` (closed beta flag `closed_beta`, admin page toggles it).
- ✅ Staff tools: moderation (`/moderacja`: releases, verification, gigs, reports, appeals),
  administration (`/admin`: roles, Premium for support, flags, audit log), promotions
  (`/admin/promocje`).
- ☐ At least two moderators (appeals are decided by a different moderator).

## 3. Product readiness

- ✅ Artist side: profile, location, verification, releases with rights/AI declarations, lossless
  masters with authenticity checks, covers, credits, soundchecks, gigs.
- ✅ Listener side: Discover with reasons, Scene, search, release/artist/venue/event pages, player
  (gapless, honest quality), library, playlists, history, "Byłem przy tym", promo codes.
- ✅ Safety: reports and takedowns with statements of reasons, appeals, copyright strikes.
- ✅ Privacy: data export and account deletion in Settings (GDPR art. 15/17/20).
- ✅ Security invariants tested on every migration (`security_invariants.test.sql`).
- ☐ Real-device playback checks (iOS Safari, Android Chrome, desktop Firefox/Safari) on production
  media — the CI matrix covers Chromium and Firefox only.

## 4. Legal (before inviting anyone outside the team)

- ☐ Lawyer review of product.md §9: L1 collective licensing (ZAiKS, STOART, SAWP, ZPAV), L2 Artist
  Terms, L3 DSA (contact point, notice form wording, transparency), L4 GDPR (legal bases, retention,
  records of processing, DPO question), L5 minimum age, L6 consumer law for promo codes.
- ☐ Published documents: Terms of Service, Artist Terms (current `terms_version` is a draft),
  Privacy Policy, Cookie notice. **No public pages exist yet** — they need the reviewed text.
- ☐ DSA contact point and an email for notices from people without an account.
- ☐ Consent banner only when the first non-essential cookie or analytics arrives (today: none —
  session cookies and the MFA hint cookie are strictly necessary).

## 5. Known gaps (tracked in Guidon)

- Reports on events and tracks; user blocking; follows between listeners; transparency report.
- Payouts aggregation (`listening_monthly_artist_shares`, D2) — before any paid plan.
- Playback telemetry and performance budgets (home LCP < 2.5 s, first audio < 1 s) measured on
  production.
