# Promotions, Entitlements & Payments

> Status: **v0.1 specification.** MVP grants Premium **only** through promo codes, beta access
> and admin grants (decision D3). Card payments arrive in Phase 14 on top of the same
> entitlement model.

## 1. Entitlement model (single source of truth)

- `plans`: `free`, `premium` (data-driven; e.g. `max_quality_tier`, feature list). New plans (family, student, artist tools) are rows, not code branches.
- `entitlements`: who has which plan, from when to when, and **why** (`source`: promo, beta, admin, referral, subscription).
  - `ends_at = null` → **Lifetime Premium**.
  - Multiple entitlements may overlap; the effective plan is the highest active one.
  - Extending: a new time-limited Premium entitlement starts at `max(now, end of current Premium)` so stacked codes add time instead of overlapping (configurable per campaign).
  - Revocation sets `revoked_at` + reason (audited); never deletes.
- The UI shows "Premium" only when `current_plan(user) = 'premium'` from the database, with the real end date ("Premium until 12 Jan 2027", "Premium for life", or the source "via code KATOFONIA26").

## 2. Free vs Premium in MVP (decision D4)

| | Free | Premium |
| --- | --- | --- |
| Catalog | full | full |
| Quality | Data Saver, High | + Lossless, Hi-Res (where available) |
| Listening restrictions | none (no shuffle-only, no skip limits) | none |
| Ads | none in MVP | none |

## 3. Code types

| `benefit_type` | `benefit_value` | Result | Redeemable in MVP |
| --- | --- | --- | --- |
| `premium_days` | days | Premium entitlement for N days | ✅ |
| `premium_months` | months | Premium entitlement for N calendar months | ✅ |
| `premium_lifetime` | — | Premium with `ends_at = null` | ✅ |
| `feature_access` | feature key | Specific feature (e.g. `hires_access`) for a period | ✅ (once a feature needs it) |
| `percent_discount` | 1–100 | Discount on a paid plan | ⏳ Phase 14 (100% = free period handled as `premium_*`) |
| `fixed_discount` | minor units + currency | Discount on a paid plan | ⏳ Phase 14 |

Code formats:
- **Unique single-use codes** (batch generated): 12+ chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, grouped `XXXX-XXXX-XXXX`, ≥ 60 bits entropy.
- **Shared campaign codes** (e.g. festival posters): human-readable, `max_uses` capped, `per_user_limit = 1`, eligibility rules recommended (e.g. new accounts only).

## 4. Redemption algorithm (`redeem_promo_code(code)`, one DB transaction)

0. Require authenticated user with verified email; check rate limit (`private.promo_attempts`).
1. Normalize (uppercase, strip spaces/dashes) → HMAC with server pepper → look up `code_hash`. **Exists?**
2. Lock the code row (`SELECT … FOR UPDATE`). **Active?** (code and campaign `active`)
3. **Within dates?** `starts_at ≤ now < expires_at` (code and campaign).
4. **User eligible?** `eligibility` rules: new users only, min account age, region, not already Lifetime, etc.
5. **Global usage limit?** `uses_count < max_uses` and campaign total limit.
6. **Per-user limit?** count of user's redemptions of this code `< per_user_limit`.
7. **Campaign rules?** e.g. one code per campaign per user, partner restrictions.
8. **Benefit grantable?** e.g. discount types unavailable before payments; lifetime users don't need time codes (return a friendly "you already have lifetime Premium" without consuming the code).
9. **Grant atomically:** insert `entitlements` row, insert `promo_redemptions`, increment `uses_count`, write `private.audit_log`. Commit.

Every failure returns a typed reason (`invalid`, `inactive`, `expired`, `not_yet_valid`,
`not_eligible`, `exhausted`, `already_redeemed`, `unavailable`, `rate_limited`). The UI shows
**the same generic message for `invalid`** to avoid confirming code existence, and specific
messages for the rest only after the code is confirmed valid. Retrying the same successful
redemption is idempotent (returns the existing grant).

**Concurrency:** the row lock serializes redemptions of one code; tests run N parallel
redemptions of a `max_uses = 1` code and assert exactly one success.

## 5. Admin

Permission-controlled (`admin` role, MFA), every action audited.

- Campaigns: create/edit/activate/deactivate; description, partner, source, dates, total limit.
- Codes: create a shared code; **batch generate** N unique codes (plaintext shown/exported **once** as CSV at creation, then only hashes remain); set benefit, dates, limits, per-user limit, eligibility.
- Lookup by `code_hint` + campaign; see uses and redemptions (user, time, granted entitlement).
- Deactivate a code/campaign (immediate); revoke a redemption's entitlement (with reason).
- Reports: redemptions per campaign over time, conversion of promo users to continued use (no vanity metrics).

## 6. Campaigns (examples)

Launch/beta, artist onboarding (Premium for artists' members), festivals and clubs (venues across Poland),
universities, community rewards (e.g. after N verified "Byłem przy tym"), partners/labels,
referrals (§7).

## 7. Referrals (post-MVP hook)

"Invite a friend → both get Premium": implemented as a per-user referral code backed by the same
promo infrastructure (`benefit_type = premium_days`, eligibility `new users only`), with a second
grant to the referrer upon the friend's qualifying activity (anti-fraud: verified email, distinct
device/IP signals, cap per referrer).

## 8. Beta access (separate from Premium)

`access_invites` gate the closed beta (D5): an invite grants **access**, optionally paired with a
beta Premium entitlement (`source = beta`) so beta testers experience Lossless/Hi-Res. Ending the
beta does not silently remove Premium; testers get a clear notice and end date.

## 9. Payments (Phase 14, outline)

- Provider evaluated then (Stripe likely: EU support, Billing, Tax, BLIK/Przelewy24 via Stripe in Poland 🔬).
- A paid subscription becomes an `entitlements` row with `source = subscription`, kept in sync by verified webhooks; the app never infers Premium from the client.
- Consumer law ⚖️ (L6): clear pricing incl. VAT, withdrawal right, easy cancellation (no dark patterns), Omnibus rules for advertised discounts.
- Artist payouts: user-centric (D2) from `listening_monthly_artist_shares`; payout policy document required before launch of paid plans.

## 10. Testing checklist

Expired code · not-yet-valid code · inactive campaign · used single-use code · max-use code at
limit · per-user limit · concurrent redemption · invalid code (generic error) · rate limiting ·
lifetime user redeeming time code · stacking extends correctly · revocation · discount code before
payments → `unavailable` · audit entries present · entitlement visible in UI only after commit.
