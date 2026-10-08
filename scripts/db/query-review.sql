-- Query review at beta scale (M11.5). Fills the local database with synthetic catalog volume
-- INSIDE A TRANSACTION THAT IS ROLLED BACK, then times the hot read paths as an anonymous
-- visitor (RLS on). Nothing is kept. Local only:
--   docker exec -i supabase_db_tunewick psql -U postgres -f - < scripts/db/query-review.sql
\set ON_ERROR_STOP on
\timing off
begin;
-- Synthetic rows skip triggers (publishing checks, graph refresh); the graph refresh is timed below.
set local session_replication_role = replica;

-- Volume: ~10x the closed beta — 3 000 artists, 12 000 releases, 60 000 tracks, 400 venues,
-- 4 000 events, 20 000 listeners with 1 000 000 listens.
insert into public.artists (slug, name, status, voivodeship, city)
select 'qr-artist-' || g, 'Artysta ' || g || ' ' || md5(g::text), 'active',
  (enum_range(null::public.voivodeship))[1 + g % 16], 'Miasto ' || (g % 200)
from generate_series(1, 3000) g;

insert into public.releases (artist_id, slug, title, type, status, publish_at)
select a.id, 'qr-release-' || g, 'Wydawnictwo ' || md5(g::text), 'album',
  case when g % 10 = 0 then 'draft' else 'published' end::public.release_status,
  now() - (g || ' hours')::interval
from generate_series(1, 12000) g
join lateral (select id from public.artists where slug = 'qr-artist-' || (1 + g % 3000)) a on true;

insert into public.release_artists (release_id, artist_id)
select r.id, r.artist_id from public.releases r where r.slug like 'qr-release-%';

insert into public.tracks (release_id, track_number, title)
select r.id, n, 'Utwór ' || n || ' ' || left(md5(r.id::text || n), 8)
from public.releases r, generate_series(1, 5) n
where r.slug like 'qr-release-%';

insert into public.venues (slug, name, city, voivodeship)
select 'qr-venue-' || g, 'Klub ' || g, 'Miasto ' || (g % 200), (enum_range(null::public.voivodeship))[1 + g % 16]
from generate_series(1, 400) g;

insert into public.events (title, venue_id, starts_at, status, artist_id)
select 'Koncert ' || g, v.id, now() + ((g % 120) - 30 || ' days')::interval, 'published', a.id
from generate_series(1, 4000) g
join lateral (select id from public.venues where slug = 'qr-venue-' || (1 + g % 400)) v on true
join lateral (select id from public.artists where slug = 'qr-artist-' || (1 + g % 3000)) a on true;

insert into public.event_lineup (event_id, artist_id, position)
select e.id, e.artist_id, 1 from public.events e where e.title like 'Koncert %';

insert into auth.users (id, email, aud, role)
select gen_random_uuid(), 'qr-' || g || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 20000) g;

create temporary table qr_users on commit drop as
  select id, row_number() over (order by email) as n from auth.users where email like 'qr-%';
create temporary table qr_tracks on commit drop as
  select t.id, t.release_id, r.artist_id, row_number() over (order by t.id) as n
  from public.tracks t join public.releases r on r.id = t.release_id
  where r.slug like 'qr-release-%' and r.status = 'published';
create temporary table qr_artists on commit drop as
  select id, row_number() over (order by slug) as n from public.artists where slug like 'qr-artist-%';

insert into public.artist_follows (user_id, artist_id)
select u.id, a.id from qr_users u
join qr_artists a on a.n in (1 + u.n % 3000, 1 + (u.n * 7) % 3000)
on conflict do nothing;

insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, tier)
select u.id, t.id, t.release_id, t.artist_id, now() - ((g % 60) || ' days')::interval - (g || ' seconds')::interval,
  180000, true, 'high'
from generate_series(1, 1000000) g
join qr_users u on u.n = 1 + g % 20000
join qr_tracks t on t.n = 1 + (g * 31) % 54000;

set local session_replication_role = origin;
analyze;

\echo '== refresh_artist_graph (full recompute) =='
explain (analyze, costs off, timing on, summary on) select private.refresh_artist_graph();

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

\echo '== discover_releases (all of Poland) =='
explain (analyze, costs off, summary on) select * from public.discover_releases(null, 12);
\echo '== discover_releases (one region) =='
explain (analyze, costs off, summary on) select * from public.discover_releases('slaskie', 12);
\echo '== discover_artists =='
explain (analyze, costs off, summary on) select * from public.discover_artists(null, 12);
\echo '== search_catalog (typo) =='
explain (analyze, costs off, summary on) select * from public.search_catalog('wydawnictwo 3f', 8);
\echo '== related_artists =='
explain (analyze, costs off, summary on)
  select * from public.related_artists((select id from public.artists where slug = 'qr-artist-42'), 8);
\echo '== upcoming_events (one region) =='
explain (analyze, costs off, summary on) select * from public.upcoming_events('slaskie', 20);
\echo '== artist page: public releases =='
explain (analyze, costs off, summary on)
  select r.id, r.title from public.releases r
  where r.artist_id = (select id from public.artists where slug = 'qr-artist-42')
  order by r.publish_at desc;
\echo '== artist page: gigs =='
explain (analyze, costs off, summary on)
  select e.id from public.events e
  where e.artist_id = (select id from public.artists where slug = 'qr-artist-42') and e.starts_at > now();

rollback;
