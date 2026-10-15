-- releases_playback: many releases in one call, same visibility as release_playback.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000009e1', 'rp-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009e1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Hurt', 'hurt-rp'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'jawne', 'Jawne', 'single'),
       ((select id from ids where name = 'artist'), 'ukryte', 'Ukryte', 'single');
insert into ids select slug, id from releases where artist_id = (select id from ids where name = 'artist');
insert into ids values ('t1', add_track((select id from ids where name = 'jawne'), 'Raz'));
insert into ids values ('t2', add_track((select id from ids where name = 'ukryte'), 'Dwa'));

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day'
where id = (select id from ids where name = 'jawne');
insert into track_audio_uploads (id, track_id, uploaded_by, object_key, file_name, size_bytes, status)
select ('00000000-0000-0000-0000-0000000009a' || n)::uuid, (select id from ids where name = 't' || n),
  '00000000-0000-0000-0000-0000000009e1', 'masters/rp/' || n || '.wav', 'm.wav', 5000000, 'accepted'
from generate_series(1, 2) n;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(
  (select array_agg(track_id) from releases_playback(array[
    (select id from ids where name = 'jawne'), (select id from ids where name = 'ukryte')])),
  array[(select id from ids where name = 't1')],
  'only releases the caller may see');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009e1", "role": "authenticated"}';
select is(
  (select count(*) from releases_playback(array[
    (select id from ids where name = 'ukryte'), (select id from ids where name = 'jawne')])),
  2::bigint, 'a member also gets their unreleased release');
select is(
  (select array_agg(release_id) from releases_playback(array[
    (select id from ids where name = 'ukryte'), (select id from ids where name = 'jawne')])),
  array[(select id from ids where name = 'ukryte'), (select id from ids where name = 'jawne')],
  'in the order asked');

select * from finish();
rollback;
