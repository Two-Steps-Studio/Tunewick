-- RLS and privilege tests for profiles, profile_settings, user_roles.
-- Counts are scoped to the fixtures so the tests also pass on a database with other data.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- Fixtures (run as postgres): two users via auth.users so the signup trigger runs.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"display_name": "Ala", "locale": "en", "age_confirmed": "true", "is_admin": true}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"locale": "xx"}', 'authenticated', 'authenticated');

-- 1–4: signup trigger
select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Ala', 'signup creates profile with display name');
select is(
  (select locale from profile_settings where user_id = '00000000-0000-0000-0000-00000000000a'),
  'en', 'valid locale from metadata is used');
select is(
  (select locale from profile_settings where user_id = '00000000-0000-0000-0000-00000000000b'),
  'pl', 'invalid locale falls back to pl');
select ok(
  (select age_confirmed_at is not null from profile_settings where user_id = '00000000-0000-0000-0000-00000000000a')
  and (select age_confirmed_at is null from profile_settings where user_id = '00000000-0000-0000-0000-00000000000b'),
  'age confirmation recorded only when confirmed');

-- 5: metadata cannot grant roles
select is(
  (select count(*)::int from user_roles where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 0, 'signup metadata never grants platform roles');

-- 6–7: anonymous access
set local role anon;
select is((select count(*)::int from profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 2, 'anon can read active profiles');
select throws_ok(
  'select * from profile_settings', '42501', null, 'anon cannot read profile settings');
reset role;

-- Act as user A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- 8–9: settings isolation
select is((select count(*)::int from profile_settings), 1, 'user sees only own settings');
select is(
  (select user_id from profile_settings), '00000000-0000-0000-0000-00000000000a'::uuid,
  'the visible settings row is the user''s own');

-- 10–11: profile updates
update profiles set display_name = 'Ala K' where id = '00000000-0000-0000-0000-00000000000a';
update profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Ala K', 'user can update own profile');
select isnt(
  (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'hacked', 'user cannot update another profile');

-- 12: protected columns
select throws_ok(
  $$update profiles set deleted_at = now() where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'user cannot set deleted_at');

-- 13: handle format enforced
select throws_ok(
  $$update profiles set handle = 'Bad Handle!' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'invalid handle is rejected');

-- 14: roles cannot be self-granted
select throws_ok(
  $$insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin')$$,
  '42501', null, 'user cannot grant themselves a role');

-- 15: has_role false by default
select is(has_app_role('admin'), false, 'has_app_role is false without a grant');
reset role;

-- 16: has_role true after a server-side grant
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(has_app_role('admin'), true, 'has_app_role is true after grant');
reset role;

-- 17: deleted profiles are hidden
update profiles set deleted_at = now() where id = '00000000-0000-0000-0000-00000000000b';
set local role anon;
select is((select count(*)::int from profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 1, 'deleted profiles are not readable');
reset role;

select * from finish();
rollback;
