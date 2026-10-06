-- MFA enforced before every API request (public.enforce_mfa, PostgREST db-pre-request).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'a7@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a8', 'a8@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a7', 'phone', 'totp', 'verified', now(), now());

select is(
  (select setting from pg_db_role_setting s
   join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) as setting
   where r.rolname = 'authenticator' and setting like 'pgrst.db_pre_request=%'),
  'pgrst.db_pre_request=public.enforce_mfa', 'PostgREST runs the check before every request');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a7", "role": "authenticated", "aal": "aal1"}';
select throws_ok('select enforce_mfa()', '42501', null,
  'a password-only session of an account with 2FA is refused');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a7", "role": "authenticated", "aal": "aal2"}';
select lives_ok('select enforce_mfa()', 'after the second factor the request goes through');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a8", "role": "authenticated", "aal": "aal1"}';
select lives_ok('select enforce_mfa()', 'accounts without 2FA are not affected');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select lives_ok('select enforce_mfa()', 'anonymous visitors are not affected');

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
select lives_ok('select enforce_mfa()', 'the worker (service role) is not affected');

select * from finish();
rollback;
