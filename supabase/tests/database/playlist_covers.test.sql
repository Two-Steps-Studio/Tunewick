-- Playlist covers: first four different release covers in playlist order, only what the caller
-- may see.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000007c1', 'pc-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007c2', 'pc-owner@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007c3', 'pc-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007c1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Okładki', 'okladki-pc'));
insert into releases (artist_id, slug, title, type)
select (select id from ids where name = 'artist'), 'r' || n, 'R' || n, 'single' from generate_series(1, 5) n;
insert into ids select 'r' || substr(slug, 2), id from releases where artist_id = (select id from ids where name = 'artist');
insert into ids select 't' || n, add_track((select id from ids where name = 'r' || n), 'T' || n) from generate_series(1, 5) n;

-- Five published singles, each with an accepted cover.
set local role postgres;
insert into images (id, kind, release_id, object_key, size_bytes, status, width, height)
select ('00000000-0000-0000-0000-0000000007a' || n)::uuid, 'release_artwork', (select id from ids where name = 'r' || n),
  'images/pc/' || n || '.png', 5000, 'accepted', 1400, 1400
from generate_series(1, 5) n;
update releases r set status = 'published', publish_at = now() - interval '1 day',
  artwork_image_id = ('00000000-0000-0000-0000-0000000007a' || substr(r.slug, 2))::uuid
where r.artist_id = (select id from ids where name = 'artist');

-- Owner's private playlist: T3, T1, T3 again, T2, T4, T5.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007c2", "role": "authenticated"}';
insert into playlists (title) values ('Mozaika');
insert into ids select 'list', id from playlists where title = 'Mozaika';
select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = t))
from unnest(array['t3', 't1', 't3', 't2', 't4', 't5']) with ordinality as x(t, o) order by o;
insert into playlists (title) values ('Pusta');
insert into ids select 'empty', id from playlists where title = 'Pusta';

select is(
  (select artwork_ids from playlist_covers(array[(select id from ids where name = 'list')])),
  array['00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-0000000007a1',
        '00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007a4']::uuid[],
  'first four different covers, in playlist order');
select is(
  (select artwork_ids from playlist_covers(array[(select id from ids where name = 'empty')])),
  '{}'::uuid[], 'an empty playlist has no covers');

-- A cover whose release is taken down disappears from the mosaic.
set local role postgres;
update releases set status = 'taken_down' where id = (select id from ids where name = 'r3');
set local role authenticated;
select is(
  (select artwork_ids[1] from playlist_covers(array[(select id from ids where name = 'list')])),
  '00000000-0000-0000-0000-0000000007a1'::uuid, 'covers of releases that are no longer public are skipped');

-- Someone else sees nothing of a private playlist.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007c3", "role": "authenticated"}';
select is(
  (select artwork_ids from playlist_covers(array[(select id from ids where name = 'list')])),
  '{}'::uuid[], 'a private playlist shows no covers to others');

select * from finish();
rollback;
