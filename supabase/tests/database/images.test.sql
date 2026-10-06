-- Artwork and artist images (M2.5).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- Isolate the image queue from rows left by local E2E runs (rolled back with the test).
update images set status = 'failed' where status in ('uploaded', 'processing');

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Okładki', 'okladki-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep');
insert into ids values ('release', (select id from releases where slug = 'ep'
  and artist_id = (select id from ids where name = 'artist')));

insert into ids values ('cover1',
  (select id from begin_image_upload('release_artwork', (select id from ids where name = 'release'), 'JPG', 900000)));
select matches(
  (select object_key from images where id = (select id from ids where name = 'cover1')),
  '^images/release_artwork/[0-9a-f-]{36}\.jpg$', 'object key uses the image id and a clean extension');
select throws_ok(
  $$select begin_image_upload('release_artwork', (select id from ids where name = 'release'), 'svg', 5000)$$,
  '22023', null, 'SVG is refused');
select throws_ok(
  $$select begin_image_upload('release_artwork', (select id from ids where name = 'release'), 'png', 30000000)$$,
  '23514', null, 'images over 25 MB are refused');
select throws_ok(
  $$update images set status = 'accepted' where id = (select id from ids where name = 'cover1')$$,
  '42501', null, 'clients cannot change images directly');
select is((select status::text from complete_image_upload((select id from ids where name = 'cover1'))),
  'uploaded', 'the uploader confirms the upload');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated"}';
select throws_ok(
  $$select begin_image_upload('release_artwork', (select id from ids where name = 'release'), 'png', 5000)$$,
  '42501', null, 'non-members cannot upload covers');
select throws_ok(
  $$select begin_image_upload('artist_image', (select id from ids where name = 'artist'), 'png', 5000)$$,
  '42501', null, 'non-members cannot upload artist photos');

-- The worker
set local role service_role;
select is((select id from claim_image_upload()), (select id from ids where name = 'cover1'), 'the worker claims the cover');
select is(
  finish_image_upload((select id from ids where name = 'cover1'),
    '{"status": "accepted", "width": 1400, "height": 1400, "dominant_color": "#c8283c",
      "variants": [{"width": 160, "key": "images/x/160.webp", "bytes": 4000}]}')::text,
  'accepted', 'an accepted cover is recorded');
select is((select artwork_image_id from releases where id = (select id from ids where name = 'release')),
  (select id from ids where name = 'cover1'), 'and becomes the release cover');

-- A rejected replacement does not touch the current cover.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
insert into ids values ('cover2',
  (select id from begin_image_upload('release_artwork', (select id from ids where name = 'release'), 'png', 900000)));
select complete_image_upload((select id from ids where name = 'cover2'));
set local role service_role;
select claim_image_upload();
select finish_image_upload((select id from ids where name = 'cover2'),
  '{"status": "rejected", "rejection": {"code": "not_square"}}');
select is(
  (select rejection_code || '/' || (select artwork_image_id from releases where id = (select id from ids where name = 'release'))::text
   from images where id = (select id from ids where name = 'cover2')),
  'not_square/' || (select id from ids where name = 'cover1')::text,
  'a rejected cover keeps its reason and the previous cover stays');

-- Artist photo
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
insert into ids values ('photo',
  (select id from begin_image_upload('artist_image', (select id from ids where name = 'artist'), 'webp', 300000)));
select complete_image_upload((select id from ids where name = 'photo'));
set local role service_role;
select claim_image_upload();
select finish_image_upload((select id from ids where name = 'photo'),
  '{"status": "accepted", "width": 640, "height": 640, "dominant_color": "#202020", "variants": []}');
select is((select image_id from artists where id = (select id from ids where name = 'artist')),
  (select id from ids where name = 'photo'), 'the artist photo is attached');

-- Who sees what
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from images where id = (select id from ids where name = 'photo')), 1,
  'everyone sees the attached photo of an active artist');
select is((select count(*)::int from images where id = (select id from ids where name = 'cover1')), 0,
  'nobody outside sees the cover of an unpublished release');
select is((select count(*)::int from images where id = (select id from ids where name = 'cover2')), 0,
  'rejected uploads are never public');

-- A cover finishing during review is not attached.
set local role postgres;
update releases set status = 'in_review' where id = (select id from ids where name = 'release');
insert into images (id, kind, release_id, object_key, size_bytes, status, claimed_at, attempts)
values ('00000000-0000-0000-0000-00000000c0c3', 'release_artwork', (select id from ids where name = 'release'),
  'images/release_artwork/late.png', 5000, 'processing', now(), 1);
set local role service_role;
select finish_image_upload('00000000-0000-0000-0000-00000000c0c3',
  '{"status": "accepted", "width": 1400, "height": 1400, "dominant_color": "#000000", "variants": []}');
select is((select artwork_image_id from releases where id = (select id from ids where name = 'release')),
  (select id from ids where name = 'cover1'), 'a cover processed during review does not replace the one under review');

select * from finish();
rollback;
