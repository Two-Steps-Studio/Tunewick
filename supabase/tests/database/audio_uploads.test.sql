-- Master audio uploads (M3.2a).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- c1 owns an artist with a draft single and one track.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Nagrania', 'nagrania-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'demo', 'Demo', 'single');
insert into ids values ('release', (select id from releases where slug = 'demo'
  and artist_id = (select id from ids where name = 'artist')));
insert into tracks (release_id, track_number, title)
values ((select id from ids where name = 'release'), 1, 'Pierwszy');
insert into ids values ('track', (select id from tracks where release_id = (select id from ids where name = 'release')));

-- Starting an upload
insert into ids values ('upload',
  (select id from begin_audio_upload((select id from ids where name = 'track'), ' Master Final.WAV ', 52428800)));

select is(
  (select status::text from track_audio_uploads where id = (select id from ids where name = 'upload')),
  'pending', 'a new upload is pending');

select matches(
  (select object_key from track_audio_uploads where id = (select id from ids where name = 'upload')),
  '^masters/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.wav$',
  'object key is masters/<artist>/<track>/<upload>.<lowercase extension>');

select is(
  (select file_name from track_audio_uploads where id = (select id from ids where name = 'upload')),
  'Master Final.WAV', 'file name is trimmed, case kept');

select throws_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'single.mp3', 5000000)$$,
  '22023', null, 'lossy file types are refused');

select throws_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'huge.flac', 5000000000)$$,
  '23514', null, 'files over 4 GiB are refused');

-- Clients cannot write the table directly
select throws_ok(
  $$update track_audio_uploads set status = 'accepted' where id = (select id from ids where name = 'upload')$$,
  '42501', null, 'members cannot set the status themselves');

select throws_ok(
  $$insert into track_audio_uploads (track_id, object_key, file_name, size_bytes)
    values ((select id from ids where name = 'track'), 'x', 'x.wav', 2000)$$,
  '42501', null, 'members cannot insert rows directly');

-- Completing
select is(
  (select status::text from complete_audio_upload((select id from ids where name = 'upload'))),
  'uploaded', 'the uploader confirms the upload');

select throws_ok(
  $$select complete_audio_upload((select id from ids where name = 'upload'))$$,
  '42501', null, 'an upload cannot be completed twice');

-- Another user sees nothing and can do nothing
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';

select is(
  (select count(*)::int from track_audio_uploads where track_id = (select id from ids where name = 'track')),
  0, 'non-members cannot see uploads');

select throws_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'mine.flac', 5000000)$$,
  '42501', null, 'non-members cannot start uploads');

-- Abandoning only affects the uploader's own pending uploads
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
insert into ids values ('second',
  (select id from begin_audio_upload((select id from ids where name = 'track'), 'take2.flac', 10000000)));
select abandon_audio_upload((select id from ids where name = 'second'));

select is(
  (select status::text from track_audio_uploads where id = (select id from ids where name = 'second')),
  'failed', 'an abandoned upload is marked failed');

-- Rate limit
select lives_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'take' || n || '.flac', 10000000)
    from generate_series(3, 10) as n$$,
  'up to 10 attempts per hour are fine');

select throws_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'take11.flac', 10000000)$$,
  '54000', null, 'the 11th attempt within an hour is refused');

select * from finish();
rollback;
