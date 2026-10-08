-- Soundchecks (M7.4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000f7', 'sc-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f8', 'sc-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f7", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Soundcheck Test', 'soundcheck-test-st'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'ep', 'EP', 'ep'),
  ((select id from ids where name = 'artist'), 'single', 'Singiel', 'single');
insert into ids select 'ep', id from releases where slug = 'ep' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'single', id from releases where slug = 'single' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('one', add_track((select id from ids where name = 'ep'), 'Jeden'));
insert into ids values ('two', add_track((select id from ids where name = 'ep'), 'Dwa'));
insert into ids values ('only', add_track((select id from ids where name = 'single'), 'Jedyny'));

set local role postgres;
update tracks set duration_ms = 200000 where id in (select id from ids where name in ('one', 'two', 'only'));

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f7", "role": "authenticated"}';
select lives_ok($$update tracks set soundcheck_start_ms = 60000 where id = (select id from ids where name = 'two')$$,
  'the artist picks an excerpt of the second track');
select throws_ok($$update tracks set soundcheck_start_ms = 199000 where id = (select id from ids where name = 'one')$$,
  '23514', null, 'an excerpt past the end is refused');

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day'
where id in (select id from ids where name in ('ep', 'single'));
-- A shorter new master must not fail processing: the excerpt falls back to the start.
update tracks set duration_ms = 30000 where id = (select id from ids where name = 'two');
select is((select soundcheck_start_ms from tracks where id = (select id from ids where name = 'two')), null,
  'a shorter master resets the excerpt instead of failing');
update tracks set duration_ms = 200000, soundcheck_start_ms = 60000 where id = (select id from ids where name = 'two');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select title || '@' || start_ms || '+' || duration_ms from release_soundchecks(array[(select id from ids where name = 'ep')])),
  'Dwa@60000+30000', 'the chosen excerpt wins, 30 seconds long');
select is((select title || '@' || start_ms from release_soundchecks(array[(select id from ids where name = 'single')])),
  'Jedyny@0', 'without a choice the soundcheck starts at the beginning');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f8", "role": "authenticated"}';
select lives_ok($$select record_listen((select id from ids where name = 'two'), now() - interval '40 seconds', 30000, false, 'high', true)$$,
  'a soundcheck listen is recorded');
select throws_ok($$select record_listen((select id from ids where name = 'two'), now(), 90000, false, 'high', true)$$,
  '22023', null, 'a soundcheck cannot last longer than a soundcheck');
select is((select soundcheck from listening_events limit 1), true, 'and is flagged, so it never counts towards payouts');

select * from finish();
rollback;
