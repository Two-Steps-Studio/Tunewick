-- Per-song stats for the artist's team: real plays only, saves / likes / playlist adds counted,
-- published songs only, nothing for anyone outside the team.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000008d1', 'ats-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008d2', 'ats-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008d3', 'ats-fan2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008d1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Statystyki', 'statystyki-ats'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep'),
       ((select id from ids where name = 'artist'), 'szkic', 'Szkic', 'single');
insert into ids select 'ep', id from releases where slug = 'ep' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'draft', id from releases where slug = 'szkic' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('hit', add_track((select id from ids where name = 'ep'), 'Hit'));
insert into ids values ('quiet', add_track((select id from ids where name = 'ep'), 'Cisza'));
insert into ids values ('unreleased', add_track((select id from ids where name = 'draft'), 'Demo'));

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day'
where id = (select id from ids where name = 'ep');
-- Hit: two listeners, three real plays (one finished); a 10 s play and a soundcheck do not count.
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select u::uuid, (select id from ids where name = 'hit'), (select id from ids where name = 'ep'),
  (select id from ids where name = 'artist'), now() - interval '1 hour', ms, done, sc
from (values
  ('00000000-0000-0000-0000-0000000008d2', 180000, true, false),
  ('00000000-0000-0000-0000-0000000008d2', 60000, false, false),
  ('00000000-0000-0000-0000-0000000008d3', 40000, false, false),
  ('00000000-0000-0000-0000-0000000008d3', 10000, false, false),
  ('00000000-0000-0000-0000-0000000008d3', 30000, true, true)
) v(u, ms, done, sc);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008d2", "role": "authenticated"}';
insert into track_saves (track_id) values ((select id from ids where name = 'hit'));
insert into track_likes (track_id) values ((select id from ids where name = 'quiet'));
insert into playlists (title) values ('Ulubione ATS');
select add_playlist_track((select id from playlists where title = 'Ulubione ATS'), (select id from ids where name = 'hit'));

-- A fan is not on the team: nothing.
select is((select count(*) from artist_track_stats((select id from ids where name = 'artist'))), 0::bigint,
  'people outside the team get no rows');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008d1", "role": "authenticated"}';
select is(
  (select array_agg(title) from artist_track_stats((select id from ids where name = 'artist'))),
  array['Hit', 'Cisza'], 'published songs only, most played first');
select is(
  (select row(listeners_28d, plays_28d, completion_rate)::text
   from artist_track_stats((select id from ids where name = 'artist')) where title = 'Hit'),
  row(2, 3, 0.33)::text, 'real plays only: 30 s or more, no soundchecks');
select is(
  (select row(saves, likes, playlist_adds)::text
   from artist_track_stats((select id from ids where name = 'artist')) where title = 'Hit'),
  row(1, 0, 1)::text, 'saves and playlist adds counted');
select is(
  (select row(plays_28d, completion_rate, likes)::text
   from artist_track_stats((select id from ids where name = 'artist')) where title = 'Cisza'),
  row(0, null::numeric, 1)::text, 'a song without plays still shows what listeners did with it');

select * from finish();
rollback;
