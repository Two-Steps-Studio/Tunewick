-- Plans and entitlements (M9.1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000f1', 'plan-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'listener@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('plan-admin@test.local', 'admin');

-- Anonymous and new listeners are on Free (High).
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select plan_code || '/' || max_quality_tier from my_plan()), 'free/high', 'anonymous listeners are on Free = High');
select is((select count(*)::int from plans), 2, 'plans are public data');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated", "aal": "aal1"}';
select is((select plan_code from my_plan()), 'free', 'a new account is on Free');
select throws_ok($$insert into entitlements (user_id, plan_code, source) values ('00000000-0000-0000-0000-0000000000f2', 'premium', 'admin')$$,
  '42501', null, 'nobody grants themselves Premium by writing the table');
select throws_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'premium', 30, 'self')$$,
  '42501', null, 'a listener cannot use the admin grant');

-- Admin needs MFA.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'premium', 30, 'beta tester')$$,
  '42501', 'multi-factor authentication required', 'admin without MFA is refused');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'premium', 30, '')$$,
  '22023', null, 'a grant needs a note');
select throws_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'free', 30, 'nope')$$,
  'P0002', null, 'free is not grantable');
select lives_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'premium', 30, 'beta tester')$$,
  'admin with MFA grants 30 days of Premium');
select lives_ok($$select admin_grant_entitlement('00000000-0000-0000-0000-0000000000f2', 'premium', 10, 'festival')$$,
  'a second grant is accepted');

-- The listener sees their own Premium, stacked: 30 + 10 days.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated", "aal": "aal1"}';
select is((select plan_code || '/' || max_quality_tier from my_plan()), 'premium/hires', 'Premium unlocks Hi-Res');
select ok((select ends_at between now() + interval '40 days' - interval '1 minute' and now() + interval '40 days' + interval '1 minute' from my_plan()),
  'stacked grants add time: Premium until now + 40 days');
select is((select source::text || ':' || source_ref from my_plan()), 'admin:beta tester', 'the plan says where it came from');
select is((select count(*)::int from entitlements), 2, 'listeners read their own entitlements');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated", "aal": "aal1"}';
select is((select count(*)::int from entitlements), 0, 'but nobody else''s');
select is((select plan_code from my_plan()), 'free', 'and another account stays on Free');

-- Revocation keeps the row; the remaining grant still counts from now.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$select admin_revoke_entitlement((select id from entitlements where user_id = '00000000-0000-0000-0000-0000000000f2' and source_ref = 'beta tester'), 'no')$$,
  '22023', null, 'revocation needs a reason');
select lives_ok(
  $$select admin_revoke_entitlement((select id from entitlements where user_id = '00000000-0000-0000-0000-0000000000f2' and source_ref = 'beta tester'), 'granted by mistake')$$,
  'admin revokes the first grant');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated", "aal": "aal1"}';
select is((select plan_code from my_plan()), 'free',
  'the stacked grant started after the revoked one, so there is a gap: Free now');
select is((select count(*)::int from entitlements where revoked_at is not null), 1, 'revoked rows are kept');

-- Lifetime.
reset role;
select lives_ok($$select system_grant_entitlement('LISTENER@test.local', 'premium', null, 'beta', 'beta 2026')$$,
  'server-side bootstrap grants Premium for life');
select throws_ok($$select system_grant_entitlement('listener@test.local', 'premium', 7, 'promo', 'code')$$,
  'P0001', null, 'a lifetime member does not get time added on top');

select * from finish();
rollback;
