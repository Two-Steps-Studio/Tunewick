-- Audio processing queue and results (M3.2b).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

-- Isolate the queue from uploads left by local E2E runs (rolled back with the test).
update track_audio_uploads set status = 'failed' where status in ('uploaded', 'processing');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

-- d1: artist, draft, two tracks, two uploaded masters.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Przetwórnia', 'przetwornia-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep');
insert into ids values ('release', (select id from releases where slug = 'ep'
  and artist_id = (select id from ids where name = 'artist')));
insert into tracks (release_id, track_number, title) values
  ((select id from ids where name = 'release'), 1, 'Raz'),
  ((select id from ids where name = 'release'), 2, 'Dwa');
insert into ids values
  ('track1', (select id from tracks where release_id = (select id from ids where name = 'release') and track_number = 1)),
  ('track2', (select id from tracks where release_id = (select id from ids where name = 'release') and track_number = 2));
insert into ids values ('up1', (select id from begin_audio_upload((select id from ids where name = 'track1'), 'raz.wav', 2000000)));
select complete_audio_upload((select id from ids where name = 'up1'));
insert into ids values ('up2', (select id from begin_audio_upload((select id from ids where name = 'track2'), 'dwa.flac', 2000000)));
select complete_audio_upload((select id from ids where name = 'up2'));

-- Clients cannot drive the queue.
select throws_ok($$select * from claim_audio_upload()$$, '42501', null,
  'members cannot claim jobs');
select throws_ok(
  $$select finish_audio_upload((select id from ids where name = 'up1'), '{"status":"accepted"}', '[]')$$,
  '42501', null, 'members cannot record results');

-- The worker
set local role service_role;

select is(
  (select id from claim_audio_upload()), (select id from ids where name = 'up1'),
  'the oldest uploaded master is claimed first');
select is(
  (select status::text || '/' || attempts from track_audio_uploads where id = (select id from ids where name = 'up1')),
  'processing/1', 'a claimed job is processing, attempt 1');
select is(
  (select id from claim_audio_upload()), (select id from ids where name = 'up2'),
  'a second worker gets the next job, not the same one');
select is((select count(*)::int from claim_audio_upload()), 0, 'empty queue returns nothing');

-- Accepted with variants
select is(
  finish_audio_upload(
    (select id from ids where name = 'up1'),
    '{"status": "accepted", "input": {"duration_s": 12.5},
      "analysis": {"loudness": {"integrated_lufs": -14.2, "true_peak_dbtp": -1.1}}}',
    jsonb_build_array(
      jsonb_build_object('tier', 'high', 'codec', 'aac_lc', 'container', 'fmp4',
        'sample_rate', 48000, 'bit_depth', null, 'nominal_kbps', 256, 'bitrate_kbps', 262,
        'samples', 600000, 'encoder_delay_samples', 1024, 'padding_samples', 320,
        'object_key', 'tracks/x/high.m4a', 'bytes', 409600, 'sha256', repeat('a', 64)),
      jsonb_build_object('tier', 'lossless', 'codec', 'flac', 'container', 'flac',
        'sample_rate', 48000, 'bit_depth', 16, 'nominal_kbps', null, 'bitrate_kbps', 900,
        'samples', 600000, 'encoder_delay_samples', 0, 'padding_samples', 0,
        'object_key', 'tracks/x/lossless.flac', 'bytes', 1400000, 'sha256', repeat('b', 64))
    )
  )::text,
  'accepted', 'an accepted report is recorded');
select is(
  (select status::text || '/' || duration_ms || '/' || integrated_lufs from track_audio_uploads
   where id = (select id from ids where name = 'up1')),
  'accepted/12500/-14.20', 'status, duration and loudness are stored');
select is(
  (select duration_ms from tracks where id = (select id from ids where name = 'track1')),
  12500, 'the track duration now comes from the audio');
select throws_ok(
  $$select finish_audio_upload((select id from ids where name = 'up1'), '{"status":"accepted"}', '[]')$$,
  '55000', null, 'a finished job cannot be finished again');

-- A crash: back to the queue, then failed after the third attempt
select is(fail_audio_upload((select id from ids where name = 'up2'))::text, 'uploaded',
  'a crashed job goes back to the queue');
update track_audio_uploads set attempts = 2 where id = (select id from ids where name = 'up2');
select is((select attempts from claim_audio_upload()), 3, 'the retry is attempt 3');
select is(fail_audio_upload((select id from ids where name = 'up2'))::text, 'failed',
  'after three attempts the upload fails for good');

-- What artists and others see
set local role authenticated;
select is(
  (select count(*)::int from track_audio_variants v
   join track_audio_uploads u on u.id = v.upload_id
   where u.track_id = (select id from ids where name = 'track1')),
  2, 'members see the variants of their tracks');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';
select is(
  (select count(*)::int from track_audio_variants where object_key like 'tracks/x/%'),
  0, 'others do not see variants of an unpublished release');

set local role anon;
select is(
  (select count(*)::int from track_audio_variants where object_key like 'tracks/x/%'),
  0, 'anonymous visitors do not see them either');

select * from finish();
rollback;
