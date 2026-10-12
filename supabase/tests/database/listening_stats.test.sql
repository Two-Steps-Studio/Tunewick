-- M14.5: a listener's statistics for a period.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000005a1', 'stats-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a2', 'stats-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Stats', 'stats-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'stats', 'Stats', 'single');
insert into ids select 'release', id from releases where slug = 'stats' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('a', add_track((select id from ids where name = 'release'), 'A'));
insert into ids values ('b', add_track((select id from ids where name = 'release'), 'B'));

-- Yesterday in Warsaw: A twice at night (one session), B once at noon, one skip, one preview.
set local role postgres;
insert into listener_preferences (user_id, time_zone) values ('00000000-0000-0000-0000-0000000005a2', 'Europe/Warsaw');
update private.listening_daily_state set processed_until = now() - interval '1 minute';
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select '00000000-0000-0000-0000-0000000005a2', (select id from ids where name = v.t), (select id from ids where name = 'release'),
  (select id from ids where name = 'artist'), (((now() at time zone 'Europe/Warsaw')::date - 1) + v.at)::timestamp at time zone 'Europe/Warsaw',
  v.ms, v.done, v.preview
from (values ('a', time '23:00', 200000, true, false), ('a', time '23:10', 200000, true, false),
             ('b', time '12:00', 180000, true, false), ('b', time '12:05', 5000, false, false),
             ('b', time '12:10', 30000, true, true)) v(t, at, ms, done, preview);
select private.refresh_listening_daily();

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a2", "role": "authenticated"}';
create temporary table s on commit drop as
  select my_listening_stats(my_today() - 7, my_today() + 1) as v;

select is((select (v->>'plays')::int from s), 3, 'plays count listens of 30 s or more, never previews');
select is((select (v->>'tracks')::int from s), 2, 'two different songs');
select is((select (v->>'night_plays')::int from s), 2, 'two plays at night, local time');
select is((select (v->'top_tracks'->0->>'title') from s), 'A', 'the most played song comes first');
select is((select (v->>'longest_session_ms')::bigint from s), 800000::bigint, 'a session spans 23:00 to the end of the second play');
select is((select (v->>'active_days')::int from s), 1, 'one active day');
select throws_ok($$ select my_listening_stats(my_today(), my_today() - 1) $$, '22023', 'period must be 1 to 400 days', 'empty periods are refused');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select my_listening_stats(current_date - 7, current_date) $$, '42501', null, 'anonymous visitors cannot ask');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
select is((select (my_listening_stats(my_today() - 7, my_today() + 1)->>'plays')::int), 0, 'everyone sees only their own listening');

select * from finish();
rollback;
