-- M14.9: artist discovery statistics — aggregates only, nothing under 3 listeners.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-0000000009' || lpad(i::text, 2, '0'))::uuid, 'ad-' || i || '@test.local',
  '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 7) i;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

-- 01 runs the artist; 02-05 listen from Gdańsk (PL); 06-07 from Berlin (DE).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000901", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Bałtyk', 'baltyk-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'morze', 'Morze', 'single');
insert into ids select 'release', id from releases where slug = 'morze' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Fala'));

set local role postgres;
insert into listener_preferences (user_id, country_code, city)
select ('00000000-0000-0000-0000-0000000009' || lpad(i::text, 2, '0'))::uuid,
  case when i <= 5 then 'PL' else 'DE' end, case when i <= 5 then 'gdańsk' else 'Berlin' end
from generate_series(2, 7) i;
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select ('00000000-0000-0000-0000-0000000009' || lpad(i::text, 2, '0'))::uuid, (select id from ids where name = 'track'),
  (select id from ids where name = 'release'), (select id from ids where name = 'artist'), now() - interval '1 day', 200000, true, false
from generate_series(2, 7) i;
insert into discovery_points (user_id, kind, award_key, points, artist_id)
select ('00000000-0000-0000-0000-0000000009' || lpad(i::text, 2, '0'))::uuid, 'new_artist', 'a' || i, 30, (select id from ids where name = 'artist')
from generate_series(2, 4) i;
select private.refresh_charts();

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
create temporary table d on commit drop as select artist_discovery((select id from ids where name = 'artist')) as v;
select is((select (v->>'listeners_7d')::int from d), 6, 'six listeners this week, public');
select is((select (v->>'discovered_30d')::int from d), 3, 'discovered by three people');
select is((select (v->>'score_30d')::int from d), 90, 'and the XP those discoveries earned');
select is((select jsonb_array_length(v->'places'->'countries') from d), 1, 'only countries with 3+ listeners');
select is((select v->'places'->'cities'->0->>'city' from d), 'Gdańsk', 'cities grouped and capitalised');
select throws_ok($$ select * from artist_discovery_weeks((select id from ids where name = 'artist')) $$, '42501', null, 'visitors get no weekly series');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000907", "role": "authenticated"}';
select is((select count(*)::int from artist_discovery_weeks((select id from ids where name = 'artist'))), 0, 'nor listeners');
select ok((why_artist_for_me((select id from ids where name = 'artist'))->>'listened')::boolean, 'a listener sees they listened');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000901", "role": "authenticated"}';
select is((select count(*)::int from artist_discovery_weeks((select id from ids where name = 'artist'))), 12, 'the team gets 12 weeks');
select is((select sum(new_listeners)::int from artist_discovery_weeks((select id from ids where name = 'artist'))), 6, 'with every new listener counted once');

select * from finish();
rollback;
