-- Promo codes and redemption (M9.2, docs/promotions.md §10). Concurrency: e2e/promo.spec.ts.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

insert into auth.users (id, email, raw_app_meta_data, aud, role, email_confirmed_at, created_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'fan1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'fan2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now(), now() - interval '400 days'),
  ('00000000-0000-0000-0000-0000000000a3', 'unverified@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', null, now()),
  ('00000000-0000-0000-0000-0000000000a4', 'spammer@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now(), now());

create temporary table codes (name text primary key, code text) on commit drop;
grant all on codes to authenticated;

insert into codes select 'single', c from system_create_promo_codes('Test single', 'premium_days', 30, 1) c;
insert into codes select 'months', c from system_create_promo_codes('Test months', 'premium_months', 2, 1) c;
insert into codes select 'shared', c from system_create_promo_codes('Test festival', 'premium_days', 14, shared_code => 'Katofonia-26', max_uses => 2) c;
insert into codes select 'lifetime', c from system_create_promo_codes('Test lifetime', 'premium_lifetime', null, 1) c;
insert into codes select 'discount', c from system_create_promo_codes('Test discount', 'percent_discount', 50, 1) c;
insert into codes select 'expired', c from system_create_promo_codes('Test expired', 'premium_days', 7, 1, expires_at => now() - interval '1 day') c;
insert into codes select 'newbies', c from system_create_promo_codes('Test newbies', 'premium_days', 7, 1, eligibility => '{"new_accounts_days": 30}') c;
insert into codes select 'inactive', c from system_create_promo_codes('Test inactive', 'premium_days', 7, 1) c;
insert into codes select 'later', c from system_create_promo_codes('Test later', 'premium_days', 7, 1) c;
update promo_campaigns set active = false where name = 'Test inactive';
update promo_campaigns set starts_at = now() + interval '1 day' where name = 'Test later';

-- Codes are generated well and never stored in plaintext.
select matches((select code from codes where name = 'single'), '^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$',
  'generated codes: 16 characters without look-alikes, grouped');
select hasnt_column('private', 'promo_codes', 'code', 'no plaintext column — only the hash and a 4-character hint');
select isnt((select code_hash from private.promo_codes limit 1), digest('x', 'sha256'), 'hashes are HMACs');
select throws_ok($$select system_create_promo_codes('Test festival', 'premium_days', 14, shared_code => 'KATOFONIA26')$$,
  '23505', null, 'the same code cannot be created twice (normalized)');

-- Signed-out callers cannot redeem; listeners cannot read codes or campaigns.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select redeem_promo_code('x')$$, '42501', null, 'anonymous callers cannot redeem');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select * from private.promo_codes$$, '42501', null, 'codes are not readable through the API');
select is((select count(*)::int from promo_campaigns), 0, 'campaigns are not visible to listeners');

-- Invalid: generic, nothing confirmed.
select is(redeem_promo_code('NOPE-NOPE-NOPE-NOPE') ->> 'status', 'invalid', 'an unknown code is invalid');
select is(redeem_promo_code((select code from codes where name = 'expired')) ->> 'status', 'expired', 'expired code');
select is(redeem_promo_code((select code from codes where name = 'later')) ->> 'status', 'not_yet_valid', 'not-yet-valid campaign');
select is(redeem_promo_code((select code from codes where name = 'inactive')) ->> 'status', 'inactive', 'inactive campaign');
select is(redeem_promo_code((select code from codes where name = 'discount')) ->> 'status', 'unavailable',
  'discounts are unavailable before payments');
reset role;
select is((select uses_count from private.promo_codes c join promo_campaigns p on p.id = c.campaign_id where p.name = 'Test discount'), 0,
  'a refused code is not consumed');
set local role authenticated;

-- Granted: case and dashes do not matter; Premium only after the grant commits in this transaction.
select is((select plan_code from my_plan()), 'free', 'Free before redeeming');
select is(redeem_promo_code(lower(replace((select code from codes where name = 'single'), '-', ' '))) ->> 'status', 'granted',
  'a single-use code is granted (case and separators ignored)');
select is((select plan_code from my_plan()), 'premium', 'Premium right after');
select is((select source::text || ':' || source_ref from my_plan()), 'promo:Test single', 'the plan names the campaign');
select is(redeem_promo_code((select code from codes where name = 'single')) ->> 'status', 'already_redeemed',
  'retrying the same code is idempotent: already redeemed, nothing new granted');
select is((select count(*)::int from entitlements), 1, 'still one entitlement');

-- Stacking: 30 days + 2 months.
select is(redeem_promo_code((select code from codes where name = 'months')) ->> 'status', 'granted', 'a second code is granted');
select ok((select ends_at between now() + interval '30 days' + interval '2 months' - interval '1 minute'
  and now() + interval '30 days' + interval '2 months' + interval '1 minute' from my_plan()), 'stacked codes add time');

-- Shared code: per-user limit 1, max_uses 2.
select is(redeem_promo_code('katofonia26') ->> 'status', 'granted', 'a shared code is granted');
select is(redeem_promo_code('KATOFONIA-26') ->> 'status', 'already_redeemed', 'once per account');

-- Eligibility: new accounts only; verified email required.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "aal": "aal1"}';
select is(redeem_promo_code((select code from codes where name = 'newbies')) ->> 'status', 'not_eligible',
  'an old account is not eligible for a new-accounts code');
select is(redeem_promo_code('Katofonia 26') ->> 'status', 'granted', 'second user takes the last shared use');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated", "aal": "aal1"}';
select is(redeem_promo_code('KATOFONIA26') ->> 'status', 'not_eligible', 'an unverified email is not eligible');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a4", "role": "authenticated", "aal": "aal1"}';
select is(redeem_promo_code('KATOFONIA26') ->> 'status', 'exhausted', 'a code at its max uses is exhausted');

-- Lifetime: a time code is not consumed by a lifetime member.
select is(redeem_promo_code((select code from codes where name = 'lifetime')) ->> 'status', 'granted', 'lifetime code granted');
select ok((select plan_code = 'premium' and ends_at is null from my_plan()), 'Premium for life');
select is(redeem_promo_code((select code from codes where name = 'newbies')) ->> 'status', 'already_lifetime',
  'a lifetime member keeps a time code unused');

-- Rate limiting: 10 failed attempts in 15 minutes.
select is((select count(*)::int from generate_series(1, 9) n where redeem_promo_code('WRONG-' || n) ->> 'status' = 'invalid'), 9,
  'failed attempts are counted');
select is(redeem_promo_code((select code from codes where name = 'months')) ->> 'status', 'rate_limited',
  'after 10 failures even a valid code waits');

reset role;
select is((select count(*)::int from private.audit_log where action = 'promo.redeem'
  and subject_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a4')), 5,
  'every successful redemption is audited');

select * from finish();
rollback;
