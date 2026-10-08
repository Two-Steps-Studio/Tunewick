-- M14.1: daily listening aggregates, privacy switches.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000f1', 'm14-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'm14-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'm14-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('M14', 'm14-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'm14', 'M14', 'single');
insert into ids select 'release', id from releases where slug = 'm14' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Jeden'));

-- The fan listens in Warsaw: two plays at 23:xx local time yesterday, one short skip, one preview.
set local role postgres;
insert into listener_preferences (user_id, time_zone) values ('00000000-0000-0000-0000-0000000000f2', 'Europe/Warsaw');
update private.listening_daily_state set processed_until = now() - interval '1 minute';
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select '00000000-0000-0000-0000-0000000000f2', (select id from ids where name = 'track'), (select id from ids where name = 'release'),
  (select id from ids where name = 'artist'), (((now() at time zone 'Europe/Warsaw')::date - 1) + v.at)::timestamp at time zone 'Europe/Warsaw',
  v.ms, v.done, v.preview
from (values (time '23:10', 200000, true, false), (time '23:40', 60000, false, false),
             (time '12:00', 5000, false, false), (time '12:05', 30000, true, true)) v(at, ms, done, preview);

select is(private.refresh_listening_daily(), 1, 'one listener-day touched');
select is((select row(ms_played, plays, tracks, artists, hours[24])::text from listening_daily
  where user_id = '00000000-0000-0000-0000-0000000000f2'),
  '(265000,2,1,1,2)', 'minutes include every real listen; plays count ≥ 30 s; previews never; hours are local');
select is(private.refresh_listening_daily(), 0, 'nothing new, nothing rewritten');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated"}';
select is((select count(*)::int from listening_daily), 1, 'listeners read their own days');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated"}';
select is((select count(*)::int from listening_daily), 0, 'and nobody else''s');

-- Privacy switches.
set local role postgres;
select ok(private.can_view('00000000-0000-0000-0000-0000000000f2', 'public'), 'service: a public level is public');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated"}';
select ok(not private.can_view('00000000-0000-0000-0000-0000000000f2', 'followers'), 'followers-only is hidden from someone who does not follow');
update profile_settings set profile_public = false where user_id = '00000000-0000-0000-0000-0000000000f2';
select ok(not private.can_view('00000000-0000-0000-0000-0000000000f2', 'public'), 'a private profile hides even public data');

select * from finish();
rollback;
