-- People first: no AI-generated music; playlist covers and banners made by people.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, raw_app_meta_data, aud, role, created_at)
values
  ('00000000-0000-0000-0000-0000000007a1', 'pf-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000007a2', 'pf-listener@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now());

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Ludzie Test', 'ludzie-test-pf'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep');
insert into ids select 'release', id from releases where slug = 'ep' and artist_id = (select id from ids where name = 'artist');

select throws_ok($$update releases set ai_content = 'ai_generated' where id = (select id from ids where name = 'release')$$,
  '23514', null, 'a release cannot be marked as AI-generated');
select lives_ok($$update releases set ai_content = 'ai_assisted' where id = (select id from ids where name = 'release')$$,
  'AI as a tool is fine');
select throws_ok($$insert into releases (artist_id, slug, title, type, ai_content)
  values ((select id from ids where name = 'artist'), 'gen', 'Gen', 'single', 'ai_generated')$$,
  '23514', null, 'nor created as one');
select throws_ok($$select add_track((select id from ids where name = 'release'), 'T'); update tracks set ai_content = 'ai_generated'
  where release_id = (select id from ids where name = 'release')$$, '23514', null, 'nor a track');
select is((release_readiness((select id from ids where name = 'release')) ->> 'ai')::boolean, true, 'music by people is ready');

select lives_ok($$select begin_image_upload('banner', (select id from ids where name = 'artist'), 'jpg', 50000)$$,
  'an artist manager uploads the artist banner');
select is((select artist_id from images where kind = 'banner' and uploaded_by = '00000000-0000-0000-0000-0000000007a1'),
  (select id from ids where name = 'artist'), 'it belongs to the artist');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a2", "role": "authenticated"}';
insert into playlists (title, visibility) values ('Moja', 'unlisted');
insert into ids select 'list', id from playlists where title = 'Moja' and owner_id = '00000000-0000-0000-0000-0000000007a2';
select lives_ok($$select begin_image_upload('playlist_cover', (select id from ids where name = 'list'), 'png', 50000)$$,
  'a listener uploads a cover for their own playlist');
select lives_ok($$select begin_image_upload('banner', '00000000-0000-0000-0000-0000000007a2', 'webp', 50000)$$,
  'and a banner for their own profile');
select throws_ok($$select begin_image_upload('banner', (select id from ids where name = 'artist'), 'jpg', 50000)$$,
  '42501', null, 'but not for someone else''s artist');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select throws_ok($$select begin_image_upload('playlist_cover', (select id from ids where name = 'list'), 'png', 50000)$$,
  '42501', null, 'nobody covers someone else''s playlist');

-- The worker finishes the playlist cover: it is attached and shown to whoever has the link.
reset role;
update images set status = 'processing' where playlist_id = (select id from ids where name = 'list');
select finish_image_upload((select id from images where playlist_id = (select id from ids where name = 'list')),
  '{"status": "accepted", "width": 640, "height": 640, "dominant_color": "#aabbcc", "variants": []}');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((open_playlist((select id from ids where name = 'list')) ->> 'cover_image_id')::uuid,
  (select id from images where playlist_id = (select id from ids where name = 'list')),
  'the cover is attached to the playlist');
select ok(can_view_image((select id from images where playlist_id = (select id from ids where name = 'list'))),
  'and visible to whoever has the link');

select * from finish();
rollback;
