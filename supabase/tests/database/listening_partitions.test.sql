-- Listening partitions kept ahead (M11.7).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

-- Simulate a missed month: drop next month's partition, then a listen arrives for it.
insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-000000000ba1', 'lp-listener@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
insert into public.artists (id, slug, name) values ('00000000-0000-0000-0000-000000000bb1', 'lp-artist', 'LP Artist');
insert into public.releases (id, artist_id, slug, title, type)
values ('00000000-0000-0000-0000-000000000bc1', '00000000-0000-0000-0000-000000000bb1', 'lp-release', 'LP', 'single');
insert into public.tracks (id, release_id, track_number, title)
values ('00000000-0000-0000-0000-000000000bd1', '00000000-0000-0000-0000-000000000bc1', 1, 'LP Track');

select format('listening_events_%s', to_char(date_trunc('month', now()) + interval '1 month', 'YYYY_MM')) as next_name \gset
drop table private.:"next_name";
insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played)
values ('00000000-0000-0000-0000-000000000ba1', '00000000-0000-0000-0000-000000000bd1', '00000000-0000-0000-0000-000000000bc1',
  '00000000-0000-0000-0000-000000000bb1', date_trunc('month', now()) + interval '1 month 2 days', 120000);
select is((select count(*)::int from private.listening_events_default where user_id = '00000000-0000-0000-0000-000000000ba1'), 1,
  'a listen for a missing month lands in the default partition');

select is(private.ensure_listening_partitions(3), 1, 'the missing month is created');
select is((select count(*)::int from private.listening_events_default where user_id = '00000000-0000-0000-0000-000000000ba1'), 0,
  'its rows leave the default partition');
select is((select tableoid::regclass::text from public.listening_events where user_id = '00000000-0000-0000-0000-000000000ba1'),
  'private.' || :'next_name', 'and live in the new partition');
select is(private.ensure_listening_partitions(3), 0, 'running again changes nothing');

select * from finish();
rollback;
