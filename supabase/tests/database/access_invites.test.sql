-- Closed-beta invite gate on auth.users (M1.4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

select is(is_feature_enabled('closed_beta'), true, 'closed beta is on by default');
select is(is_feature_enabled('does_not_exist'), false, 'unknown flags are off');

select is(
  create_access_invites(array['SINGLE-USE-1', 'multi-use-2'], 1, null, 'pgtap'), 2,
  'service-side invite creation stores codes');
select create_access_invites(array['EXPIRED-3'], 1, now() - interval '1 day', 'pgtap');

select is(
  (select count(*)::int from private.access_invites
   where label = 'pgtap' and code_hash !~ '^[0-9a-f]{64}$'),
  0, 'codes are stored only as SHA-256 hashes');

select is(access_invite_is_valid('single use 1'), true, 'codes are normalized (case, spaces, dashes)');
select is(access_invite_is_valid('EXPIRED-3'), false, 'expired invite is not valid');
select is(access_invite_is_valid('NOPE'), false, 'unknown invite is not valid');

-- Sign-up without an invite is rejected.
select throws_ok(
  $$insert into auth.users (id, email, aud, role)
    values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', 'authenticated', 'authenticated')$$,
  'P0001', null, 'sign-up without invite fails');

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', '{"invite_code": "EXPIRED-3"}', 'authenticated', 'authenticated')$$,
  'P0001', null, 'sign-up with expired invite fails');

-- Valid single-use invite works once.
select lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', '{"invite_code": "single-use-1"}', 'authenticated', 'authenticated')$$,
  'sign-up with a valid invite succeeds');

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local', '{"invite_code": "SINGLE-USE-1"}', 'authenticated', 'authenticated')$$,
  'P0001', null, 'a used single-use invite cannot be used again');

select ok(
  (select not (raw_user_meta_data ? 'invite_code') and raw_app_meta_data ? 'access_invite_id'
   from auth.users where id = '00000000-0000-0000-0000-0000000000d1'),
  'plaintext code is removed and the invite is recorded in app metadata');

-- Staff bypass (app_metadata can only be set server-side).
select lives_ok(
  $$insert into auth.users (id, email, raw_app_meta_data, aud, role)
    values ('00000000-0000-0000-0000-0000000000d3', 'd3@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated')$$,
  'beta_bypass in app metadata skips the gate');

-- Flag off: no invite needed.
update feature_flags set enabled = false where key = 'closed_beta';
select lives_ok(
  $$insert into auth.users (id, email, aud, role)
    values ('00000000-0000-0000-0000-0000000000d4', 'd4@test.local', 'authenticated', 'authenticated')$$,
  'with the flag off, sign-up needs no invite');

select * from finish();
rollback;
