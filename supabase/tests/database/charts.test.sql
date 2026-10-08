-- M14.2 charts: listeners not plays, places only with ≥ 3 listeners, origin scopes, fresh, world.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-00000000c0' || lpad(n::text, 2, '0'))::uuid, 'ch-' || n || '@test.local',
  '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 6) n;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

-- c01 owns two artists: Gliwice (PL, rock) and Berlin (DE).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000c001", "role": "authenticated"}';
insert into ids values ('pl', create_artist('Hałda Ch', 'halda-ch'));
insert into ids values ('de', create_artist('Berlin Ch', 'berlin-ch'));
update artists set city = 'Gliwice', voivodeship = 'slaskie' where id = (select id from ids where name = 'pl');
update artists set country_code = 'DE', city = 'Berlin' where id = (select id from ids where name = 'de');
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'pl'), 'ch-pl', 'Hałda EP', 'ep'),
  ((select id from ids where name = 'de'), 'ch-de', 'Berlin EP', 'ep');
insert into ids select 'r_pl', id from releases where slug = 'ch-pl';
insert into ids select 'r_de', id from releases where slug = 'ch-de';
insert into release_genres (release_id, genre_id) values ((select id from ids where name = 'r_pl'), (select id from genres where slug = 'rock'));
insert into ids values ('a', add_track((select id from ids where name = 'r_pl'), 'Szyb'));
insert into ids values ('b', add_track((select id from ids where name = 'r_pl'), 'Hałda'));
insert into ids values ('c', add_track((select id from ids where name = 'r_de'), 'Spree'));

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '2 hours' where id = (select id from ids where name = 'r_pl');
update releases set status = 'published', publish_at = now() - interval '10 days' where id = (select id from ids where name = 'r_de');
-- Listeners c02–c04 in Poland, c05 in Germany, c06 without a country.
insert into listener_preferences (user_id, country_code)
select ('00000000-0000-0000-0000-00000000c0' || lpad(n::text, 2, '0'))::uuid, case when n <= 4 then 'PL' when n = 5 then 'DE' end
from generate_series(2, 6) n;

create function pg_temp.listen(listener int, track text, ago interval, ms int default 60000) returns void
language sql as $$
  insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played)
  select ('00000000-0000-0000-0000-00000000c0' || lpad(listener::text, 2, '0'))::uuid, t.id, t.release_id, r.artist_id, now() - ago, ms
  from tracks t join releases r on r.id = t.release_id where t.id = (select id from ids where name = track);
$$;
-- Track a: 5 listeners this week (one plays it ten times — still one listener).
select pg_temp.listen(n, 'a', interval '1 day') from generate_series(2, 6) n;
select pg_temp.listen(2, 'a', interval '2 hours') from generate_series(1, 9);
-- Track b: 1 listener; one skip (10 s) does not count.
select pg_temp.listen(2, 'b', interval '1 day');
select pg_temp.listen(3, 'b', interval '1 day', 10000);
-- Track c: 3 listeners this week, 1 the week before (rising).
select pg_temp.listen(n, 'c', interval '2 days') from generate_series(4, 6) n;
select pg_temp.listen(2, 'c', interval '10 days');
insert into discovery_points (user_id, kind, award_key, points, track_id, artist_id)
select ('00000000-0000-0000-0000-00000000c0' || lpad(n::text, 2, '0'))::uuid, 'new_song', 'ch-c-' || n, 10,
  (select id from ids where name = 'c'), (select id from ids where name = 'de') from generate_series(4, 6) n;
insert into track_saves (user_id, track_id) values ('00000000-0000-0000-0000-00000000c003', (select id from ids where name = 'b'));
select private.refresh_charts();

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select array_agg(title || ':' || value order by rank) from music_chart('top')), array['Szyb:5', 'Spree:3', 'Hałda:1'],
  'top: listeners, not plays; a skip is not a listen');
select is((select array_agg(title || ':' || value order by rank) from music_chart('top', 'country', 'PL')), array['Szyb:3'],
  'Popular in Poland: listeners there, only with at least 3 of them');
select is((select count(*)::int from music_chart('top', 'country', 'DE')), 0, 'one listener in Germany is not a chart');
select is((select array_agg(title order by rank) from music_chart('top', 'region', 'europe')), array['Szyb'],
  'regions add up their countries');
select is((select array_agg(title order by rank) from music_chart('discovered', 'country', 'DE')), array['Spree'],
  'other charts by origin: discovered music from Germany');
select is((select array_agg(title || ':' || coalesce(growth::text, 'new') order by rank) from music_chart('rising')),
  array['Szyb:new', 'Spree:200'], 'rising: the most new listeners vs the week before (growth % when there was one)');
select is((select array_agg(title order by rank) from music_chart('saved')), array['Hałda'], 'most saved');
select is((select array_agg(title order by rank) from music_chart('top', 'city', 'gliwice', 'PL')), array['Szyb', 'Hałda'],
  'city scene: music from Gliwice');
select is((select array_agg(title order by rank) from music_chart('top', 'genre', 'rock')), array['Szyb', 'Hałda'], 'genre');
select is((select count(*)::int from music_chart('underground')), 3, 'small artists are underground');
select is((select array_agg(name || ':' || value order by rank) from artist_chart('rising')), array['Hałda Ch:5', 'Berlin Ch:2'], 'rising artists');
select is((select array_agg(name order by rank) from artist_chart('new_listeners')), array['Hałda Ch', 'Berlin Ch'],
  'artists with the most new listeners');
select is((select array_agg(title) from fresh_releases(24)), array['Hałda EP'], 'fresh in the last 24 hours');
select is((select count(*)::int from fresh_releases(720)), 2, 'and in the last 30 days');
select is((select array_agg(country_code) from world_tracks('PL')), array['DE'], 'discover the world: outside your country');
select is((select array_agg(city) from music_cities('pl')), array['Gliwice'], 'cities with music');

select * from finish();
rollback;
