-- Data retention (privacy policy §6).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-000000000da1', 'rt-keep@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

-- An old partition (26 months ago) with a listen, and a recent listen that must stay.
insert into public.artists (id, slug, name) values ('00000000-0000-0000-0000-000000000db1', 'rt-artist', 'RT');
insert into public.releases (id, artist_id, slug, title, type)
values ('00000000-0000-0000-0000-000000000dc1', '00000000-0000-0000-0000-000000000db1', 'rt-release', 'RT', 'single');
insert into public.tracks (id, release_id, track_number, title)
values ('00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dc1', 1, 'RT Track');
select format('listening_events_%s', to_char(date_trunc('month', now()) - interval '26 months', 'YYYY_MM')) as old_name \gset
select format('create table private.%I partition of public.listening_events for values from (%L) to (%L)',
  :'old_name', (date_trunc('month', now()) - interval '26 months')::date, (date_trunc('month', now()) - interval '25 months')::date) as ddl \gset
:ddl;
insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played)
values
  ('00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dc1',
   '00000000-0000-0000-0000-000000000db1', date_trunc('month', now()) - interval '26 months' + interval '3 days', 60000),
  ('00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dc1',
   '00000000-0000-0000-0000-000000000db1', now() - interval '1 day', 60000);

insert into private.audit_log (actor_kind, action, subject_type, subject_id, created_at)
values ('system', 'rt.old', 'test', 'x', now() - interval '3 years'), ('system', 'rt.recent', 'test', 'x', now() - interval '1 day');
insert into private.playback_metrics (day, outcome, browser)
values ((now() - interval '14 months')::date, 'started', 'chrome'), (now()::date, 'started', 'chrome');

select is((private.apply_retention() ->> 'listening_partitions')::int, 1, 'listening months older than 25 months are dropped');
select is(to_regclass('private.' || :'old_name'), null, 'the old partition is gone');
select is((select count(*)::int from public.listening_events where user_id = '00000000-0000-0000-0000-000000000da1'), 1,
  'recent listening stays');
select is((select count(*)::int from private.audit_log where action like 'rt.%'), 1, 'audit entries older than 2 years go');
select is((select count(*)::int from private.playback_metrics where day < (now() - interval '13 months')::date), 0,
  'telemetry older than 13 months goes');
select ok((select count(*) from cron.job where jobname = 'retention') = 1, 'retention runs daily');

select * from finish();
rollback;
