-- Playlists (M5.2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000d1', 'pl-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'pl-owner@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'pl-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Playlista Test', 'playlista-test-pt'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep'),
  ((select id from ids where name = 'artist'), 'draft', 'Draft', 'single');
insert into ids select 'release', id from releases where slug = 'ep' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'draft', id from releases where slug = 'draft' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('a', add_track((select id from ids where name = 'release'), 'A'));
insert into ids values ('b', add_track((select id from ids where name = 'release'), 'B'));
insert into ids values ('c', add_track((select id from ids where name = 'release'), 'C'));
insert into ids values ('hidden', add_track((select id from ids where name = 'draft'), 'Hidden'));
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'release');

-- Owner creates a private playlist and fills it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';
insert into playlists (title) values ('Na nocną zmianę');
insert into ids select 'list', id from playlists where title = 'Na nocną zmianę';
select is((select visibility::text from playlists where id = (select id from ids where name = 'list')), 'private', 'new playlists are private');
select lives_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'a'))$$, 'add A');
select lives_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'b'))$$, 'add B');
select lives_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'c'))$$, 'add C');
select lives_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'a'))$$, 'duplicates are allowed');
select throws_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'hidden'))$$,
  '42501', null, 'unreleased tracks cannot be added');

create temporary view ordered as
  select string_agg(t.title, '' order by pt.position, pt.added_at) as titles
  from playlist_tracks pt join tracks t on t.id = pt.track_id
  where pt.playlist_id = (select id from ids where name = 'list');
grant select on ordered to anon, authenticated;
select is((select titles from ordered), 'ABCA', 'items keep the order they were added');

select lives_ok($$select move_playlist_track((select pt.id from playlist_tracks pt join tracks t on t.id = pt.track_id where t.title = 'C'), 0)$$,
  'move C to the top');
select is((select titles from ordered), 'CABA', 'C is first');
select lives_ok($$select move_playlist_track((select pt.id from playlist_tracks pt join tracks t on t.id = pt.track_id where t.title = 'C'), 3)$$,
  'move C to the end');
select is((select titles from ordered), 'ABAC', 'C is last');
select lives_ok($$select move_playlist_track((select pt.id from playlist_tracks pt join tracks t on t.id = pt.track_id where t.title = 'B'), 0)$$,
  'move B to the top');
select is((select titles from ordered), 'BAAC', 'B is first, the rest keeps its order');

-- Private means private.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d3", "role": "authenticated"}';
select is((select count(*)::int from playlists where id = (select id from ids where name = 'list')), 0, 'others do not see a private playlist');
select throws_ok($$select add_playlist_track((select id from ids where name = 'list'), (select id from ids where name = 'a'))$$,
  '42501', null, 'nor add to it');
update playlists set title = 'Hacked' where id = (select id from ids where name = 'list');
delete from playlist_tracks where playlist_id = (select id from ids where name = 'list');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';
select is((select title || ':' || (select count(*) from playlist_tracks where playlist_id = p.id) from playlists p where id = (select id from ids where name = 'list')),
  'Na nocną zmianę:4', 'nor change or empty it');
update playlists set visibility = 'unlisted' where id = (select id from ids where name = 'list');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select titles from ordered), 'BAAC', 'an unlisted playlist plays for anyone with the link');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';
delete from playlist_tracks where id = (select pt.id from playlist_tracks pt join tracks t on t.id = pt.track_id where t.title = 'B');
select is((select titles from ordered), 'AAC', 'the owner removes an item');
delete from playlists where id = (select id from ids where name = 'list');
select is((select count(*)::int from playlist_tracks where playlist_id = (select id from ids where name = 'list')), 0, 'deleting the playlist removes its items');

select * from finish();
rollback;
