-- Listening history (M5.3).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000e7', 'ls-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e8', 'ls-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e9', 'ls-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e7", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Historia Test', 'historia-test-ht'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'jest', 'Jest', 'single'),
  ((select id from ids where name = 'artist'), 'nie', 'Nie', 'single');
insert into ids select 'public', id from releases where slug = 'jest' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'draft', id from releases where slug = 'nie' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'public'), 'Słuchany'));
insert into ids values ('second', add_track((select id from ids where name = 'public'), 'Drugi'));
insert into ids values ('hidden', add_track((select id from ids where name = 'draft'), 'Ukryty'));
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'public');
update tracks set duration_ms = 180000 where id in ((select id from ids where name = 'track'), (select id from ids where name = 'second'));

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select record_listen((select id from ids where name = 'track'), now(), 30000)$$, '42501', null,
  'anonymous listens are not recorded');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e8", "role": "authenticated"}';
select lives_ok($$select record_listen((select id from ids where name = 'track'), now() - interval '3 minutes', 180000, true, 'high')$$,
  'a full listen is recorded');
select lives_ok($$select record_listen((select id from ids where name = 'second'), now() - interval '1 minute', 45000)$$,
  'a partial listen of another track');
select lives_ok($$select record_listen((select id from ids where name = 'track'), now() - interval '20 seconds', 15000)$$,
  'the first track again');
select throws_ok($$select record_listen((select id from ids where name = 'hidden'), now(), 30000)$$, '42501', null,
  'unreleased tracks are refused');
select throws_ok($$select record_listen((select id from ids where name = 'track'), now(), 600000)$$, '22023', null,
  'more time than the track lasts is refused');
select throws_ok($$select record_listen((select id from ids where name = 'track'), now() + interval '1 hour', 30000)$$, '22023', null,
  'a start in the future is refused');
select throws_ok($$insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played)
  values ('00000000-0000-0000-0000-0000000000e8', (select id from ids where name = 'track'), (select id from ids where name = 'public'),
    (select id from ids where name = 'artist'), now(), 999999)$$, '42501', null, 'nobody writes events directly');

select is((select array_agg(t.title || ':' || r.plays order by r.last_played_at desc)
  from my_recent_tracks() r join tracks t on t.id = r.track_id),
  array['Słuchany:2', 'Drugi:1'], 'recently played: newest first, one row per track, real play counts');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e9", "role": "authenticated"}';
select is((select count(*)::int from listening_events), 0, 'history is private');
select is((select count(*)::int from my_recent_tracks()), 0, 'and so is the summary');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e8", "role": "authenticated"}';
delete from listening_events;
select is((select count(*)::int from my_recent_tracks()), 0, 'the listener clears the history');

reset role;
select is((select count(*)::int from pg_inherits i join pg_class c on c.oid = i.inhrelid
  join pg_namespace n on n.oid = c.relnamespace
  where i.inhparent = 'public.listening_events'::regclass and n.nspname = 'private'), 16,
  'monthly partitions (15) and a default one, all outside the API schema');

select * from finish();
rollback;
