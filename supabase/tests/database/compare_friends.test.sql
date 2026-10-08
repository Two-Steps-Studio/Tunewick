-- You vs a friend: visible exactly when the friend's activity is visible to you (M8.2 rules).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000b1', 'cf-ala@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'cf-bartek@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'cf-cyprian@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
update profiles set handle = 'ala-cf' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set handle = 'bartek-cf' where id = '00000000-0000-0000-0000-0000000000b2';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000000b2');
select ok(compare_with('bartek-cf') ? 'them', 'a follower compares when activity is visible to followers (the default)');
select is((compare_with('bartek-cf', 30) -> 'them' ->> 'songs')::int, 0, 'with real (empty) numbers');
select is(compare_with('ala-cf'), null, 'not with yourself');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b3", "role": "authenticated"}';
select is(compare_with('bartek-cf'), null, 'someone who does not follow learns nothing');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';
insert into user_blocks (blocked_id) values ('00000000-0000-0000-0000-0000000000b1');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select is(compare_with('bartek-cf'), null, 'a block ends comparisons');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select compare_with('ala-cf')$$, '42501', null, 'visitors cannot compare');

select * from finish();
rollback;
