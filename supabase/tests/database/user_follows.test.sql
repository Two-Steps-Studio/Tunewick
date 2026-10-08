-- Following people and comparing discovery (privacy decided by the compared person).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000b1', 'uf-ala@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'uf-bartek@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'uf-cyprian@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
update profiles set handle = 'ala-uf' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set handle = 'bartek-uf' where id = '00000000-0000-0000-0000-0000000000b2';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select lives_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b2')$$, 'Ala follows Bartek');
select throws_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b1')$$, '23514', null, 'nobody follows themselves');
select throws_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b3')$$, '42501', null, 'only people with a public profile name can be followed');
select is((select followers from user_follow_counts('00000000-0000-0000-0000-0000000000b2')), 1, 'follower counts are public and real');

-- Bartek's default is 'followers': only people HE follows see his activity. Ala follows him; not enough.
select is(compare_with('bartek-uf'), null, 'following someone does not open their stats');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';
select lives_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b1')$$, 'Bartek follows Ala');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select ok(compare_with('bartek-uf') ? 'them', 'now Ala is in his circle and may compare');
select is((compare_with('bartek-uf', 30) -> 'them' ->> 'songs')::int, 0, 'with real (empty) numbers');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';
update profile_settings set activity_visibility = 'private';
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(compare_with('bartek-uf'), null, '"Only me" ends every comparison');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b3", "role": "authenticated"}';
select is((select count(*)::int from user_follows), 0, 'who follows whom is private to the two people');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select compare_with('ala-uf')$$, '42501', null, 'visitors cannot compare');

select * from finish();
rollback;
