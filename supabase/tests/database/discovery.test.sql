-- Discovery expansion: global model, discovery ledger, progress, rankings, feed (X-DB1…X-DB4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(51);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'dx-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'dx-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'dx-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

-- Two artists: one from Poland (voivodeship only), one from Germany with artist genres.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
insert into ids values ('pl', create_artist('Odkrycie PL', 'odkrycie-pl-dx'));
insert into ids values ('de', create_artist('Entdeckung DE', 'entdeckung-de-dx'));
update artists set voivodeship = 'slaskie', city = 'Gliwice' where id = (select id from ids where name = 'pl');
update artists set country_code = 'DE', region = 'Berlin', languages = '{de,en}' where id = (select id from ids where name = 'de');
insert into artist_genres (artist_id, genre_id) values ((select id from ids where name = 'de'), (select id from genres where slug = 'techno'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'pl'), 'pierwsza', 'Pierwsza', 'ep'),
  ((select id from ids where name = 'de'), 'erste', 'Erste', 'single'),
  ((select id from ids where name = 'pl'), 'szkic', 'Szkic', 'single');
insert into ids select 'r_pl', id from releases where slug = 'pierwsza';
insert into ids select 'r_de', id from releases where slug = 'erste';
insert into ids select 'r_draft', id from releases where slug = 'szkic';
insert into release_genres (release_id, genre_id) values ((select id from ids where name = 'r_pl'), (select id from genres where slug = 'rock'));
insert into ids values ('t1', add_track((select id from ids where name = 'r_pl'), 'Jeden'));
insert into ids values ('t2', add_track((select id from ids where name = 'r_pl'), 'Dwa'));
insert into ids values ('t3', add_track((select id from ids where name = 'r_de'), 'Drei'));
insert into ids values ('t_draft', add_track((select id from ids where name = 'r_draft'), 'Ukryty'));

select is((select country_code from artists where id = (select id from ids where name = 'pl')), 'PL',
  'a voivodeship implies Poland');
select throws_ok($$update artists set languages = '{Polish}' where id = (select id from ids where name = 'pl')$$,
  '23514', null, 'languages are ISO codes');
select throws_ok($$insert into artist_links (artist_id, kind, url) values ((select id from ids where name = 'pl'), 'website', 'http://insecure.example')$$,
  '23514', null, 'artist links must be https');
select lives_ok($$insert into artist_links (artist_id, kind, url) values ((select id from ids where name = 'pl'), 'bandcamp', 'https://odkrycie.bandcamp.com')$$,
  'owners add links');

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '2 days'
where id in ((select id from ids where name = 'r_pl'), (select id from ids where name = 'r_de'));
update tracks set duration_ms = 180000, soundcheck_start_ms = 60000, soundcheck_duration_ms = 20000
where id in ((select id from ids where name = 't1'), (select id from ids where name = 't2'), (select id from ids where name = 't3'));
insert into track_audio_uploads (id, track_id, object_key, file_name, size_bytes, status)
values ('00000000-0000-0000-0000-0000000000f1', (select id from ids where name = 't1'), 'ingest/dx-t1', 't1.wav', 4096, 'accepted');
insert into track_audio_variants (upload_id, tier, codec, container, sample_rate, nominal_kbps, bitrate_kbps, samples, object_key, bytes, sha256)
values ('00000000-0000-0000-0000-0000000000f1', 'high', 'aac_lc', 'fmp4', 44100, 256, 258, 7938000, 'media/dx-t1-high.mp4', 5000000, repeat('a', 64)),
  ('00000000-0000-0000-0000-0000000000f1', 'lossless', 'flac', 'flac', 44100, null, 900, 7938000, 'media/dx-t1.flac', 20000000, repeat('b', 64));

select ok((select public_code ~ '^[a-z2-9]{10}$' from tracks where id = (select id from ids where name = 't1')),
  'tracks get a random public code');
create temporary table code_before on commit drop as select public_code from tracks where id = (select id from ids where name = 't1');
update tracks set public_code = 'aaaaaaaaaa' where id = (select id from ids where name = 't1');
select is((select public_code from tracks where id = (select id from ids where name = 't1')), (select public_code from code_before),
  'the public code never changes (shared links keep working)');

set local role postgres;
update tracks set soundcheck_start_ms = 60000, soundcheck_duration_ms = 20000 where id = (select id from ids where name = 't2');

-- Feed functions are public and only show playable public tracks.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select array_agg(title) from discover_candidates()), array['Jeden'],
  'candidates: public tracks with a streamable AAC variant only');
select is((select genre_ids from discover_candidates() where title = 'Jeden'),
  array[(select id from genres where slug = 'rock')]::smallint[], 'candidates carry their genres');
select is((select jsonb_array_length(variants) from track_previews(array[(select id from ids where name = 't1')])), 1,
  'previews expose the AAC variant only (no lossless file for a preview)');
select is((select preview_start_ms from track_previews(array[(select id from ids where name = 't1')])), 60000,
  'the artist''s soundcheck is the preview window');
select is((select count(*)::int from track_previews(array[(select id from ids where name = 't_draft')])), 0,
  'unreleased tracks have no preview');
select is((select array_agg(title) from discover_releases(country => 'DE')), array['Erste'], 'browse filters by country');
select is((select array_agg(country_code order by country_code) from browse_countries()), array['DE', 'PL'],
  'browse lists countries that have public music');

-- Listening and awards.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select is((record_listen((select id from ids where name = 't1'), now() - interval '1 minute', 8000, false, null, true)) -> 'awards',
  '[]'::jsonb, 'a skip (8 s) discovers nothing');
select is((select sum((a ->> 'points')::int)::int from jsonb_array_elements(
    record_listen((select id from ids where name = 't1'), now() - interval '50 seconds', 20000, true, null, true) -> 'awards') a),
  14, 'a whole preview of new music: new song 1 + new artist 3 + new genre 5 + new country 5');
select is((record_listen((select id from ids where name = 't1'), now() - interval '40 seconds', 25000, false, 'high', false)) -> 'awards',
  '[]'::jsonb, 'replaying a discovered song earns nothing');
select is((select sum((a ->> 'points')::int)::int from jsonb_array_elements(
    record_listen((select id from ids where name = 't3'), now() - interval '30 seconds', 16000, false, null, true) -> 'awards') a),
  14, 'a German techno artist is a new artist, genre and country (genre from the artist when the release has none)');
select is((record_listen((select id from ids where name = 't1'), now() - interval '20 seconds', 180000, true, 'high', false)) -> 'awards',
  '[{"kind": "full_listen", "points": 1}]'::jsonb, 'a full listen of recently discovered music');
select is((record_listen((select id from ids where name = 't1'), now() - interval '10 seconds', 180000, true, 'high', false)) -> 'awards',
  '[]'::jsonb, 'looping it pays once a day');
select throws_ok($$select record_listen((select id from ids where name = 't1'), now(), 40000, false, null, true)$$,
  '22023', null, 'a preview (soundcheck) lasts at most 35 s');
select throws_ok($$insert into discovery_points (user_id, kind, award_key, points) values ('00000000-0000-0000-0000-0000000000a2', 'share', 'x', 100)$$,
  '42501', null, 'nobody writes points directly');

select lives_ok($$insert into track_saves (track_id) values ((select id from ids where name = 't2'))$$, 'a listener saves a track');
delete from track_saves where track_id = (select id from ids where name = 't2');
insert into track_saves (track_id) values ((select id from ids where name = 't2'));
select is((select sum(points)::int from discovery_points where kind = 'save'), 2, 'unsave + save again pays once');
select is(record_share((select id from ids where name = 't1'), 'copy'), 3, 'sharing pays');
select is(record_share((select id from ids where name = 't1'), 'copy'), 0, 'sharing the same song again today does not');

-- The feed reads cached aggregates: zero until the scheduled refresh, real counts after it.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select listeners_30d from discover_candidates() where title = 'Jeden'), 0, 'candidates use the cache (not yet refreshed)');
set local role postgres;
select lives_ok($$select private.refresh_discovery_stats()$$, 'the cache refreshes without blocking readers');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select listeners_30d from discover_candidates() where title = 'Jeden'), 1, 'after the refresh the listener counts');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';

-- Caps: a rule at its daily cap still records the discovery, with 0 points.
set local role postgres;
update discovery_point_rules set daily_cap = 2 where kind = 'new_song';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select is((select (a ->> 'points')::int from jsonb_array_elements(
    record_listen((select id from ids where name = 't2'), now() - interval '5 seconds', 30000, false, null, false) -> 'awards') a
  where a ->> 'kind' = 'new_song'), 0, 'over the daily cap a discovery counts but earns 0');

select is((select array[unique_songs, unique_artists, new_songs, new_artists, new_countries, saves]
  from my_discovery_stats()), array[3, 2, 3, 2, 2, 1], 'listening stats count what was really heard');
select is((select new_songs from my_discovery_stats('week')), 3, 'stats for this week');
select is((select plays from my_discovery_stats()), 3, 'plays are full-player listens of ≥ 30 s (previews are not plays)');
select is((select array_agg(t.title) from my_recent_tracks() r join tracks t on t.id = r.track_id), array['Dwa', 'Jeden'],
  'recently played leaves out previews and soundchecks');
select is((my_progress() ->> 'current_streak')::int, 1, 'a day with a discovery starts a streak');
select is((my_progress() ->> 'today_artists')::int, 2, 'goal progress: artists discovered today');
select is((my_progress() ->> 'points_total')::int, 14 + 14 + 1 + 2 + 3, 'points add up');
select ok((select bool_or(code = 'first_discovery') from user_achievements), 'First Discovery is unlocked');
select ok((select (g ->> 'w')::numeric > 0 from jsonb_array_elements(my_taste() -> 'genres') g
  where (g ->> 'id')::smallint = (select id from genres where slug = 'techno')), 'taste: genres from what was heard (artist genres as fallback)');
select ok((select (a ->> 'w')::numeric >= 3 from jsonb_array_elements(my_taste() -> 'artists') a
  where (a ->> 'id')::uuid = (select id from ids where name = 'pl')), 'taste: saves and listens build artist affinity');
set local role postgres;
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed)
select u.id, t.track, t.release, t.artist, now() - interval '1 hour', 60000, false
from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000a3'::uuid)) u(id),
  (values ((select id from ids where name = 't1'), (select id from ids where name = 'r_pl'), (select id from ids where name = 'pl')),
          ((select id from ids where name = 't3'), (select id from ids where name = 'r_de'), (select id from ids where name = 'de'))) t(track, release, artist);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}';
select is((select (c ->> 'n')::int from jsonb_array_elements(my_taste() -> 'co_listened') c
  where (c ->> 'artist')::uuid = (select id from ids where name = 'de')), 2,
  'taste: two listeners who play the same artist also play Entdeckung — a similar-listener signal');
select is(jsonb_array_length(my_taste() -> 'heard'), 3, 'taste: discovered tracks are known, so the feed does not repeat them');
select is((my_records() -> 'most_songs_day' ->> 'value')::int, 3, 'records: most songs discovered in a day');

-- Rankings: only listeners with a handle who did not opt out.
select is((select count(*)::int from discovery_leaderboard('week')), 0, 'no handle, no public ranking row');
select is((select rank from my_ranking('week')), 1, 'but the listener sees their own place');
update profiles set handle = 'odkrywca-dx' where id = '00000000-0000-0000-0000-0000000000a2';
select is((select handle from discovery_leaderboard('week') where is_me), 'odkrywca-dx', 'with a handle they are listed');
insert into listener_preferences (country_code, show_in_rankings) values ('PL', false);
select is((select count(*)::int from discovery_leaderboard('week')), 0, 'opting out hides them');
select is((select participants from my_ranking('week', 'PL')), 1, 'country rankings use the listener''s country');
select throws_ok($$update listener_preferences set time_zone = 'Mars/Olympus'$$, '22023', null, 'time zones are validated');

-- Privacy.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "role": "authenticated"}';
select is((select count(*)::int from discovery_points), 0, 'points are private');
select is((select new_songs from my_discovery_stats()), 0, 'and so are stats');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select record_events('[{"name": "song_impression"}]')$$, '42501', null, 'anonymous events are not stored');

select * from finish();
rollback;
