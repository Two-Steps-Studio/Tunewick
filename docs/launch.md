# Global launch checklist

What the code already does is listed in `docs/discovery-v2.md` and `docs/deployment.md`. This page
is what people have to decide or set up before Tunewick is promoted worldwide. Order matters.

## Must have before promotion

1. **Legal review for a worldwide audience.** The Terms, Artist Terms, Privacy Policy and Content
   Policy (`apps/web/src/modules/legal/content/`) are written for Poland ("independent artists
   from all of Poland", Polish law). A lawyer should review them for users outside Poland/EU
   (consumer law, age of consent for data, DMCA-style takedowns in the US, etc.), and the operator
   details must be filled in (`modules/legal/operator.ts`). Only then translate them.
2. **Email that scales.** Supabase's built-in email sends only a few messages per hour — sign-up
   confirmations and password resets would stop after the first handful of people. Set up a real
   SMTP provider (e.g. Resend, Postmark, Amazon SES) in Supabase → Authentication → Emails → SMTP,
   with a sending domain (SPF, DKIM, DMARC).
3. **Your own domain.** Add it in Vercel, set `NEXT_PUBLIC_SITE_URL=https://<domain>` and redeploy;
   add the domain to Supabase → Authentication → URL configuration (site URL and redirect URLs)
   and to the R2 CORS rules.
4. **Open sign-up.** The `closed_beta` feature flag requires an invite to sign up. An admin turns
   it off in Admin → Feature flags when you are ready for the public.
5. **Audio worker running** (TrueNAS or Fly.io, `docs/deployment.md` §3b) and **music published**
   from several countries, so discovery, charts and the map are not empty on day one.

## Right after launch

- Submit `https://<domain>/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- Watch Vercel runtime errors and Supabase logs daily for the first week.
- Supabase plan: check connection and database size limits against the expected traffic; the
  free plan pauses inactive projects.
- Moderation: someone on the moderation queue every day (reports, release review, verification).

## Good to have

- More interface languages (the code supports adding locales; legal texts stay in English until
  reviewed translations exist).
- Uptime monitoring of `/` and `/api/discover/feed` (e.g. Better Stack, UptimeRobot).
