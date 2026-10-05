# Security

> Status: **v0.1 design for review** (Guidon: "Phase 4: Database & security design").
> Principle: **never trust the client.** Every permission, entitlement and quality claim is
> decided on the server or in the database.

## 1. Assets to protect

| Asset | Why it matters |
| --- | --- |
| Artist masters (original audio) | Artists' core property; leaks destroy trust. |
| Delivery variants | Licensed for streaming only. |
| User accounts and personal data (history, attendance, location hints) | GDPR, user trust. |
| Entitlements and promo codes | Direct financial value; abuse target. |
| Admin and moderation capabilities | Full platform control. |
| Rights declarations, takedown records | Legal evidence. |

## 2. Authentication

- Supabase Auth: email + password (min 10 chars, breached-password check via HIBP k-anonymity where available), email verification required before uploads, promo redemption or public activity.
- Password reset via single-use, short-lived links; reset invalidates other sessions.
- Sessions: HTTP-only, `Secure`, `SameSite=Lax` cookies; refresh token rotation; server validates the session on every request with `getUser()`, not only by decoding the cookie.
- MFA (TOTP) **required** for `moderator` and `admin` roles; available to artists.
- Login rate limiting per IP and per account; generic error messages (no account enumeration).

## 3. Authorization

- **Platform roles:** `listener` (implicit), `moderator`, `admin` in `user_roles`.
- **Resource roles:** `artist_members.role` (owner/manager/member), later `venue_members`.
- **Defense in depth:** server code checks authorization explicitly **and** RLS enforces it in the database. Either one alone must be sufficient to block access.
- Service-role key exists only in server environments (Vercel server functions, worker). Never in client bundles: enforced by an ESLint rule and a CI check that greps build output for the key prefix.
- Admin actions go through dedicated server functions that write to `private.audit_log` in the same transaction.

## 4. Media security

| Control | Detail |
| --- | --- |
| Masters never served | `masters` bucket has no public access and no edge route. Only the worker can read it. |
| Signed playback tokens | HMAC-SHA256 tokens (key in Cloudflare and Vercel secrets, rotated with key id `kid`), bound to `user_id`, `variant_id`, `tier`, `exp` (~10 min). Issued only after `can_stream_tier()` passes. |
| Edge verification | `media-edge` Worker rejects missing/expired/tampered tokens, wrong variant, or tier mismatch; supports `Range`; adds `Cache-Control` for the CDN cache without caching authorization decisions. |
| Abuse signals | Per-user token issuance rate limit; anomaly flag when one account streams from many IPs concurrently. |
| Downloads | No download endpoint in MVP. Streaming of non-DRM files can be captured by a determined user. That is an accepted risk for indie content under the artist terms, and DRM is a future option (architecture.md §6.4). |

## 5. Upload security

1. Upload URL issued only to verified-email artist members for a release in `draft`, with a size limit (e.g. ≤ 2 GB per file) and allowed content types.
2. Files land in the **ingest** (quarantine) bucket under a random key. Never served, never trusted.
3. The worker validates by **decoding**, not by extension or MIME: ffprobe + full decode to detect corruption; rejects unsupported codecs, hidden data, excessive duration, invalid channel counts.
4. Media tooling runs in an isolated container with no access to other secrets, a read-only filesystem except the temp dir, CPU/memory/time limits, and pinned, patched ffmpeg versions (ffmpeg parsers are an attack surface).
5. Images: re-encoded server-side (strips metadata/EXIF, neutralizes malformed files); SVG uploads are not accepted.
6. Duplicate/fingerprint checks before moderation (see audio.md).

## 6. Promo code security

- Codes: ≥ 12 characters from an unambiguous alphabet (no 0/O, 1/I/L), ≥ 60 bits of entropy for single-use codes; human-friendly campaign codes (e.g. `KATOFONIA26`) allowed only with low per-code limits and campaign rules.
- Stored as HMAC-SHA256(pepper, normalized code). The pepper lives in server secrets, not in the database.
- Redemption only through `redeem_promo_code()`: one transaction, row lock on the code, all checks server-side, idempotent per (user, code).
- Rate limits: per user (e.g. 5 failed attempts / 15 min), per IP, and global anomaly alerts. Exponential backoff after failures.
- Every attempt is logged in `private.promo_attempts`; every grant in `private.audit_log`.
- Eligibility rules (new accounts only, minimum account age, verified email) checked in the database function.

## 7. Application security

| Area | Control |
| --- | --- |
| Input validation | zod schemas on every Server Action / Route Handler input; DB constraints as the last line. |
| XSS | React escaping; no `dangerouslySetInnerHTML` with user content; bios and descriptions rendered as plain text or sanitized limited Markdown. |
| CSP | Strict CSP with nonces; `media.tunewick.com` allowed for media; no third-party scripts without review. |
| CSRF | Server Actions' built-in origin checks; `SameSite` cookies; custom Route Handlers verify `Origin`. |
| SSRF | No server-side fetching of user-supplied URLs in MVP (ticket links are stored and rendered as links only, validated as `https:`). |
| Headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal. |
| Dependencies | Lockfiles committed; Dependabot/Renovate; `npm audit`/`pip-audit` in CI; review of new dependencies. |
| Secrets | Never in git; `.env.example` lists names only; secret scanning enabled on GitHub; rotation procedure documented per secret. |
| Logging | No passwords, tokens, codes or full IPs in logs; IPs stored as salted hashes where needed. |

## 8. Privacy and GDPR (design level, legal validation pending: L4, L5)

- **Data minimization:** no birth date stored; age is confirmed at signup ("I am at least 16"; threshold to be confirmed for Poland). No precise location stored; home city only, user-chosen.
- **Visibility controls:** listening activity, likes and attendance each have public / followers / private settings. Default for new users: followers.
- **Consent:** analytics and personalization based on consent (`consents` table, versioned). Strictly necessary data only without consent. Cookie banner with equal-weight "reject" option, no dark patterns.
- **Rights:** export (JSON of profile, playlists, likes, history, attendance), deletion, rectification through `data_requests`. Self-service in settings.
- **Retention:** see database.md §6.
- **Processors (EU regions):** Supabase, Vercel, Cloudflare, Fly.io, Sentry, email provider. DPAs to be signed; records of processing maintained.
- **Minors:** community features (public activity, following) limited by age policy once L5 is decided.

## 9. Moderation and abuse

- Reporting on artists, releases, tracks, playlists, profiles, events.
- Moderation queue with statement of reasons for every decision (DSA). Appeals path.
- Blocking between users.
- Takedown process: notice → temporary restriction (when manifestly infringing) → artist notified → counter-notice → decision. Documented in licensing.md.
- Repeat-infringer policy for artist accounts.

## 10. Threat model (STRIDE summary)

| Threat | Example | Mitigation |
| --- | --- | --- |
| Spoofing | Account takeover of an artist or admin | MFA for staff, rate limits, breached-password check, session rotation, login alerts |
| Spoofing | Fake artist claims a real band | Verification workflow with evidence; "verified" only after moderator decision; unverified artists clearly marked |
| Tampering | Client sends "premium: true" or "tier: hires" | Entitlement and tier decided server-side; token bound to tier; edge enforces |
| Tampering | Artist edits a published release to swap audio | Published releases immutable for audio; changes create a new version that goes through review |
| Repudiation | Admin grants lifetime Premium and denies it | Append-only audit log in the same transaction |
| Information disclosure | Masters leak via guessable URLs | No route to masters; random keys; private bucket |
| Information disclosure | RLS gap exposes private playlists or history | Deny-by-default RLS, pgTAP coverage per policy, server-side checks too |
| Information disclosure | Attendance reveals someone's whereabouts | Attendance visibility settings, followers-only default, marking allowed only after the event starts |
| Denial of service | Upload floods, huge files, decompression bombs | Upload quotas per artist, size limits, worker resource limits, queue backpressure |
| Denial of service | Promo brute force | Hashing, rate limits, backoff, alerts |
| Elevation of privilege | `security definer` function with mutable `search_path` | `search_path = ''`, code review checklist, tests |
| Elevation of privilege | Malicious media file exploits ffmpeg | Isolated container, pinned patched versions, no secrets in worker beyond needed bucket keys |

## 11. Security verification in CI and before launch

- pgTAP: every RLS policy and security definer function tested (allowed and denied cases).
- Integration tests: entitlement bypass attempts, token tampering, expired tokens, promo concurrency (parallel redemption of a single-use code must yield exactly one success).
- Static checks: ESLint security rules, service-key leak check, dependency audit, secret scanning.
- Before public beta: external penetration test (or Strix scan + manual review), security review of the media edge and upload pipeline.

## 12. Incident response (outline)

1. Detect (Sentry alerts, anomaly alerts, user reports).
2. Contain (feature flag kill switch, token key rotation, suspend accounts).
3. Assess scope (audit log, access logs).
4. Notify (GDPR: supervisory authority UODO within 72 h when required; affected users).
5. Post-mortem documented in the repo.
