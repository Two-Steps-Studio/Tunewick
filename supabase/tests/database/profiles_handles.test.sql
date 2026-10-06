-- Handle rules: reserved names, uniqueness (case-insensitive), settings updates.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select throws_ok(
  $$update profiles set handle = 'admin' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '23514', null, 'reserved handle is rejected');

select throws_ok(
  $$update profiles set handle = 'tunewick-official' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '23514', null, 'tunewick- prefix is rejected');

select lives_ok(
  $$update profiles set handle = 'basista-z-gliwic' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'a normal handle is accepted');

select lives_ok(
  $$update profile_settings set locale = 'en', activity_visibility = 'private'
    where user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  'user can change own locale and visibility');

select throws_ok(
  $$update profile_settings set age_confirmed_at = now()
    where user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'age confirmation cannot be edited by the user');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';

select throws_ok(
  $$update profiles set handle = 'basista-z-gliwic' where id = '00000000-0000-0000-0000-0000000000c2'$$,
  '23505', null, 'handles are unique');

reset role;

select is(
  (select locale from profile_settings where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'en', 'settings change persisted');

select * from finish();
rollback;
