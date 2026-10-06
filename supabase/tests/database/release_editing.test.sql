-- Release editing functions (M2.3): add/move/delete tracks, genres limit, RLS still applies.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-0000000000a' || n)::uuid, 'a' || n || '@test.local',
       '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 2) as n;

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Edytor', 'edytor-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'album', 'Album', 'album');
insert into ids values ('release', (select id from releases where slug = 'album'));

insert into ids values ('t1', add_track((select id from ids where name = 'release'), ' Jeden '));
insert into ids values ('t2', add_track((select id from ids where name = 'release'), 'Dwa'));
insert into ids values ('t3', add_track((select id from ids where name = 'release'), 'Trzy'));

select is(
  (select string_agg(title, ',' order by track_number) from tracks
   where release_id = (select id from ids where name = 'release')),
  'Jeden,Dwa,Trzy', 'add_track appends in order and trims titles');

select lives_ok($$select move_track((select id from ids where name = 't3'), -1::smallint)$$,
  'move a track up');
select is(
  (select string_agg(title, ',' order by track_number) from tracks
   where release_id = (select id from ids where name = 'release')),
  'Jeden,Trzy,Dwa', 'tracks swapped positions');

select lives_ok($$select move_track((select id from ids where name = 't1'), -1::smallint)$$,
  'moving the first track up is a no-op');

select lives_ok($$select delete_track((select id from ids where name = 't1'))$$, 'delete a track');
select is(
  (select string_agg(track_number || ':' || title, ',' order by track_number) from tracks
   where release_id = (select id from ids where name = 'release')),
  '1:Trzy,2:Dwa', 'numbering has no gaps after delete');

select lives_ok(
  $$select set_release_genres((select id from ids where name = 'release'), array[1, 2, 3]::smallint[])$$,
  'three genres are allowed');
select throws_ok(
  $$select set_release_genres((select id from ids where name = 'release'), array[1, 2, 3, 4]::smallint[])$$,
  '23514', null, 'a fourth genre is refused');

-- Outsiders cannot use the functions to touch someone else's draft (RLS hides the rows).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select throws_ok($$select move_track((select id from ids where name = 't2'), -1::smallint)$$,
  'P0002', null, 'outsider cannot reorder tracks');
select throws_ok(
  $$select add_track((select id from ids where name = 'release'), 'Obcy')$$,
  '42501', null, 'outsider cannot add tracks');

select * from finish();
rollback;
