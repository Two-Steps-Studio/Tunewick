-- M14.7: TuneWick Replay.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role, created_at)
values
  ('00000000-0000-0000-0000-0000000007a1', 'replay-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now() - interval '3 years'),
  ('00000000-0000-0000-0000-0000000007a2', 'replay-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now() - interval '3 years');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Replay', 'replay-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'replay', 'Replay', 'single');
insert into ids select 'release', id from releases where slug = 'replay' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('a', add_track((select id from ids where name = 'release'), 'Pierwszy'));
insert into ids values ('b', add_track((select id from ids where name = 'release'), 'Drugi'));

-- Last year: "Pierwszy" on 2 January, then "Drugi" in March (UTC listener).
set local role postgres;
update private.listening_daily_state set processed_until = '2000-01-01';
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select '00000000-0000-0000-0000-0000000007a2', (select id from ids where name = v.t), (select id from ids where name = 'release'),
  (select id from ids where name = 'artist'), make_timestamptz(extract(year from now())::int - 1, v.m, v.d, 12, 0, 0, 'UTC'), 200000, true, false
from (values ('a', 1, 2), ('b', 3, 10), ('b', 3, 11)) v(t, m, d);
select private.refresh_listening_daily();

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a2", "role": "authenticated"}';
create temporary table r on commit drop as select my_replay(extract(year from now())::int - 1) as v;
select is((select (v->'stats'->>'plays')::int from r), 3, 'the year''s plays');
select is((select v->'first_song'->>'title' from r), 'Pierwszy', 'the first song of the year');
select is((select (v->'months'->2->>'ms')::bigint from r), 400000::bigint, 'March in the months');
select ok((select (v->>'complete')::boolean from r), 'a past year is complete');
select is((select count(*)::int from listening_replays), 1, 'and stored');
select ok(not (my_replay(extract(year from now())::int)->>'complete')::boolean, 'this year is so far');
select is(my_replay(extract(year from now())::int + 1), null, 'no Replay for next year');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select is((select count(*)::int from listening_replays), 0, 'nobody sees another listener''s Replay');

select * from finish();
rollback;
