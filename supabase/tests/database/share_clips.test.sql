-- Share clips: one per track, window, language and design; the worker queue; public tracks only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000e1', 'clip-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'clip-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;

-- Leave clips from local E2E runs out of the queue (rolled back with the test).
update share_clips set status = 'failed' where status in ('queued', 'processing');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Klip', 'klip-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'klip', 'Klip', 'single');
insert into ids select 'release', id from releases where slug = 'klip' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Klip'));

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated"}';
select throws_ok($$select * from request_share_clip((select id from ids where name = 'track'), 'pl', 0, 30000, 1::smallint)$$,
  '42501', null, 'no clips of unpublished music');

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'release');
update tracks set duration_ms = 120000 where id = (select id from ids where name = 'track');
insert into track_audio_uploads (id, track_id, object_key, file_name, size_bytes, status)
values ('00000000-0000-0000-0000-0000000000e9', (select id from ids where name = 'track'), 'ingest/clip', 'klip.wav', 4096, 'accepted');
insert into track_audio_variants (upload_id, tier, codec, container, sample_rate, nominal_kbps, bitrate_kbps, samples, object_key, bytes, sha256)
values
  ('00000000-0000-0000-0000-0000000000e9', 'data_saver', 'aac_lc', 'fmp4', 44100, 96, 98, 5292000, 'media/klip-ds.mp4', 1000000, repeat('c', 64)),
  ('00000000-0000-0000-0000-0000000000e9', 'high', 'aac_lc', 'fmp4', 44100, 256, 258, 5292000, 'media/klip-high.mp4', 3000000, repeat('d', 64));

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select * from request_share_clip((select id from ids where name = 'track'), 'pl', 0, 30000, 1::smallint)$$,
  '42501', null, 'visitors cannot start clips');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated"}';
select throws_ok($$select * from request_share_clip((select id from ids where name = 'track'), 'pl', 100000, 30000, 1::smallint)$$,
  '22023', null, 'the window must fit the track');
insert into ids select 'clip', id from request_share_clip((select id from ids where name = 'track'), 'pl', 40000, 30000, 1::smallint);
select is((select row(status, needs_card, card_key = 'clips/' || (select id from ids where name = 'clip') || '/card.png')::text
  from request_share_clip((select id from ids where name = 'track'), 'pl', 40000, 30000, 1::smallint)),
  '(awaiting_card,t,t)', 'the same window is the same clip; its card is still wanted');
select isnt((select id from request_share_clip((select id from ids where name = 'track'), 'en', 40000, 30000, 1::smallint)),
  (select id from ids where name = 'clip'), 'another language is another clip (the card text differs)');
select throws_ok($$select * from share_clips$$, '42501', null, 'the table is reached only through functions');
select is(queue_share_clip((select id from ids where name = 'clip'))::text, 'queued', 'with the card in place it is queued');
select is((select needs_card from request_share_clip((select id from ids where name = 'track'), 'pl', 40000, 30000, 1::smallint)),
  false, 'a queued clip needs no card');

-- The worker
set local role service_role;
-- The English clip never got its card: only the Polish one is in the queue.
select is((select row(id = (select id from ids where name = 'clip'), audio_key, start_ms, duration_ms, attempts)::text from claim_share_clip()),
  '(t,media/klip-high.mp4,40000,30000,1)', 'the worker gets the window and the high AAC variant');
select is((select count(*)::int from claim_share_clip()), 0, 'nothing else is queued');
select is(fail_share_clip((select id from ids where name = 'clip'))::text, 'queued', 'a crash goes back to the queue');
select is((select count(*)::int from claim_share_clip()), 1, 'and is claimed again');
select is(finish_share_clip((select id from ids where name = 'clip'), 'clips/t/klip.mp4', 123456)::text, 'ready', 'the rendered clip is ready');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select row(status, object_key)::text from share_clip((select id from ids where name = 'clip'))),
  '(ready,clips/t/klip.mp4)', 'anyone can fetch a ready clip of a public track');

set local role postgres;
update releases set status = 'taken_down' where id = (select id from ids where name = 'release');
set local role anon;
select is((select count(*)::int from share_clip((select id from ids where name = 'clip'))), 0, 'a taken-down song has no clip');

-- Limit: ten new clips an hour per listener.
set local role postgres;
update releases set status = 'published' where id = (select id from ids where name = 'release');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated"}';
select is((select string_agg(locale, ',' order by locale) from my_share_clips()), 'en,pl', 'the data export lists the clips one asked for');
select lives_ok($$select request_share_clip((select id from ids where name = 'track'), 'pl', n * 1000, 30000, 1::smallint) from generate_series(0, 7) n$$,
  'up to ten new clips an hour');
select throws_ok($$select * from request_share_clip((select id from ids where name = 'track'), 'pl', 9000, 30000, 1::smallint)$$,
  '54000', null, 'then the limit');

select * from finish();
rollback;
