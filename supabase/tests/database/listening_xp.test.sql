-- XP for listening time: +10 XP per 10 minutes a day, at most 120 XP; short plays and soundchecks
-- don't count; it is XP, not Discovery Score.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

update discovery_challenges set enabled = false;

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000006a1', 'lx-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a2', 'lx-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Czas Słuchania', 'czas-sluchania-lx'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'dlugie', 'Długie', 'single');
insert into ids select 'release', id from releases where slug = 'dlugie' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Długi'));

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '2 days' where id = (select id from ids where name = 'release');
update tracks set duration_ms = 400000 where id = (select id from ids where name = 'track');
insert into track_audio_uploads (id, track_id, object_key, file_name, size_bytes, status)
values ('00000000-0000-0000-0000-0000000006f1', (select id from ids where name = 'track'), 'ingest/lx', 'lx.wav', 4096, 'accepted');
insert into track_audio_variants (upload_id, tier, codec, container, sample_rate, nominal_kbps, bitrate_kbps, samples, object_key, bytes, sha256)
values ('00000000-0000-0000-0000-0000000006f1', 'high', 'aac_lc', 'fmp4', 44100, 256, 258, 17640000, 'media/lx-high.mp4', 5000000, repeat('a', 64));

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a2", "role": "authenticated"}';

-- 6 minutes: nothing yet for listening time.
select is((select count(*)::int from jsonb_array_elements(
    record_listen((select id from ids where name = 'track'), now() - interval '1 second', 360000, true, 'high', false) -> 'awards') a
  where a ->> 'kind' = 'listening'), 0, 'under 10 minutes earns no listening XP');

-- A soundcheck and a short play don't add time.
select record_listen((select id from ids where name = 'track'), now() - interval '1 second', 25000, false, 'high', true);
select record_listen((select id from ids where name = 'track'), now() - interval '1 second', 20000, false, 'high', false);
select is((select count(*)::int from discovery_points where user_id = '00000000-0000-0000-0000-0000000006a2' and kind = 'listening'),
  0, 'soundchecks and plays under 30 s do not count');

-- 12 minutes in total: the first step.
select is((select (a ->> 'points')::int from jsonb_array_elements(
    record_listen((select id from ids where name = 'track'), now() - interval '1 second', 360000, true, 'high', false) -> 'awards') a
  where a ->> 'kind' = 'listening'), 10, '10 minutes earn 10 XP');

-- 3 hours more: capped at 12 steps (2 hours, 120 XP).
select record_listen((select id from ids where name = 'track'), now() - interval '1 second', 360000, true, 'high', false)
from generate_series(1, 30);
select is((select sum(points)::int from discovery_points where user_id = '00000000-0000-0000-0000-0000000006a2' and kind = 'listening'),
  120, 'at most 120 XP a day for listening');
select is((select count(*)::int from discovery_points where user_id = '00000000-0000-0000-0000-0000000006a2' and kind = 'listening'),
  12, 'each 10-minute step is paid once');

select is((my_progress() ->> 'discovery_points_total')::int,
  (select coalesce(sum(points), 0)::int from discovery_points
   where user_id = '00000000-0000-0000-0000-0000000006a2'
     and kind in ('new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')),
  'listening XP is not part of the Discovery Score');

select * from finish();
rollback;
