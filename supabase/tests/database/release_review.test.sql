-- Release review and publishing (M5.0).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Isolate the audio queue from uploads left by local E2E runs (rolled back with the test).
update track_audio_uploads set status = 'failed' where status in ('uploaded', 'processing');

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e2', 'moderator');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;

-- e1: a single with one track.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated", "aal": "aal1"}';
insert into ids values ('artist', create_artist('Recenzja', 'recenzja-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'singiel', 'Singiel', 'single');
insert into ids values ('release', (select id from releases where slug = 'singiel'
  and artist_id = (select id from ids where name = 'artist')));
insert into tracks (release_id, track_number, title) values ((select id from ids where name = 'release'), 1, 'Jeden');
insert into ids values ('track', (select id from tracks where release_id = (select id from ids where name = 'release')));

select throws_ok($$select submit_release((select id from ids where name = 'release'))$$,
  '55000', null, 'an incomplete release cannot be submitted');

-- Rights (also declares AI involvement) and an accepted master.
insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
  samples, ai_content, territories, terms_version)
values ((select id from ids where name = 'release'), true, true, array['none'], 'none', 'human', array['WORLD'], 't');
insert into ids values ('upload', (select id from begin_audio_upload((select id from ids where name = 'track'), 'jeden.wav', 2000000)));
select complete_audio_upload((select id from ids where name = 'upload'));

select is(release_readiness((select id from ids where name = 'release')) ->> 'audio', 'false',
  'audio is not ready while the master waits for the worker');

set local role service_role;
select claim_audio_upload();
select finish_audio_upload((select id from ids where name = 'upload'),
  '{"status": "accepted", "input": {"duration_s": 30}, "analysis": {"loudness": {}}}',
  jsonb_build_array(jsonb_build_object('tier', 'high', 'codec', 'aac_lc', 'container', 'fmp4',
    'sample_rate', 48000, 'nominal_kbps', 256, 'bitrate_kbps', 260, 'samples', 1440000,
    'encoder_delay_samples', 1024, 'padding_samples', 200, 'object_key', 'tracks/review/high.m4a',
    'bytes', 975000, 'sha256', repeat('c', 64))));

set local role authenticated;
select is(release_readiness((select id from ids where name = 'release')),
  '{"ai": true, "audio": true, "rights": true, "tracks": true}'::jsonb, 'everything is ready');

select lives_ok($$select submit_release((select id from ids where name = 'release'))$$,
  'a ready release is submitted');
select is((select status::text from releases where id = (select id from ids where name = 'release')),
  'in_review', 'it waits for review');
select throws_ok(
  $$select begin_audio_upload((select id from ids where name = 'track'), 'nowy.wav', 2000000)$$,
  '42501', null, 'audio cannot change while in review');
select throws_ok($$select review_release((select id from ids where name = 'release'), 'approve')$$,
  '42501', null, 'artists cannot approve their own release');

-- The moderator: role alone is not enough without MFA.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select review_release((select id from ids where name = 'release'), 'approve')$$,
  '42501', null, 'moderators need MFA in the session');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated", "aal": "aal2"}';
select is(
  (select count(*)::int from releases where status = 'in_review' and id = (select id from ids where name = 'release')),
  1, 'staff see releases waiting for review');
select throws_ok($$select review_release((select id from ids where name = 'release'), 'return', 'zle')$$,
  '22023', null, 'a return needs a real note');
select is(
  review_release((select id from ids where name = 'release'), 'return', 'Tytuł utworu różni się od pliku.')::text,
  'rejected', 'the moderator returns the release');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated", "aal": "aal1"}';
select is((select review_note from releases where id = (select id from ids where name = 'release')),
  'Tytuł utworu różni się od pliku.', 'the artist sees the note');
select is(
  (select array_agg(kind::text order by id) from release_review_events
   where release_id = (select id from ids where name = 'release')),
  array['submitted', 'returned'], 'the history lists what happened');

select submit_release((select id from ids where name = 'release'));
select withdraw_release_submission((select id from ids where name = 'release'));
select is((select status::text from releases where id = (select id from ids where name = 'release')),
  'draft', 'a submission can be withdrawn');
select submit_release((select id from ids where name = 'release'));
select is((select review_note from releases where id = (select id from ids where name = 'release')),
  null, 'resubmitting clears the old note');

-- Approval publishes it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated", "aal": "aal2"}';
select is(review_release((select id from ids where name = 'release'), 'approve')::text,
  'published', 'the moderator approves');
select ok(release_is_public((select id from ids where name = 'release')), 'without a release date it is public at once');

set local role postgres;
select is(
  (select count(*)::int from private.audit_log
   where subject_id = (select id from ids where name = 'release')::text
     and actor_id = '00000000-0000-0000-0000-0000000000e2'),
  2, 'both decisions are in the audit log with the moderator');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(
  (select count(*)::int from track_audio_variants where object_key = 'tracks/review/high.m4a'),
  1, 'listeners can now see the playable variants');

select is(
  (select jsonb_array_length(variants) from release_playback((select id from ids where name = 'release'))),
  1, 'listeners get the playback data of a public release');

-- A future release date schedules the release.
set local role postgres;
update releases set status = 'in_review', release_date = (now() at time zone 'Europe/Warsaw')::date + 30
where id = (select id from ids where name = 'release');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated", "aal": "aal2"}';
select review_release((select id from ids where name = 'release'), 'approve');
select ok(not release_is_public((select id from ids where name = 'release')),
  'with a future release date it waits until that day');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from release_playback((select id from ids where name = 'release'))),
  0, 'nothing is playable before the release day');

select * from finish();
rollback;
