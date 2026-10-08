-- M14.4 missions (daily/weekly/monthly/events, own XP, once per period) and new badges.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000a9', 'missions@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

select is((select count(*)::int from my_missions() where cadence = 'daily'), 3, 'three daily missions');
select is((select count(*)::int from my_missions() where cadence = 'monthly'), 2, 'two monthly missions');
select is((select count(*)::int from my_missions() where cadence = 'event'), 0, 'no event running by default');

-- A special event for this week only, and a daily-only set of missions to test.
update discovery_challenges set enabled = code in ('day_two_countries', 'day_daily_set', 'day_five_songs');
insert into discovery_challenges (code, metric, target, cadence, xp, starts_at, ends_at)
values ('event_world_week', 'artist_countries', 3, 'event', 500, now() - interval '1 day', now() + interval '6 days'),
       ('event_over', 'new_songs', 1, 'event', 500, now() - interval '9 days', now() - interval '2 days');
select is((select array_agg(code order by code) from my_missions() where cadence = 'event'), array['event_world_week'],
  'events run inside their window only');

-- Artists from three countries.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a9", "role": "authenticated"}';
insert into ids values ('pl', create_artist('Misja PL', 'misja-pl'));
insert into ids values ('de', create_artist('Misja DE', 'misja-de'));
insert into ids values ('jp', create_artist('Misja JP', 'misja-jp'));
update artists set country_code = 'PL' where id = (select id from ids where name = 'pl');
update artists set country_code = 'DE' where id = (select id from ids where name = 'de');
update artists set country_code = 'JP' where id = (select id from ids where name = 'jp');
set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, artist_id)
select '00000000-0000-0000-0000-0000000000a9', 'new_artist', id::text, 30, id from ids where name in ('pl', 'de');

set local role authenticated;
select is((select row(progress, completed_at is not null)::text from my_missions() where code = 'day_two_countries'), '(2,t)',
  'artists from two countries complete the daily mission');
select is((select points::int from discovery_points where kind = 'challenge' and award_key like 'day_two_countries:%'), 150,
  'a mission pays its own XP');
set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, artist_id)
values ('00000000-0000-0000-0000-0000000000a9', 'new_artist', (select id::text from ids where name = 'jp'), 30, (select id from ids where name = 'jp'));
select is((select points::int from discovery_points where kind = 'challenge' and award_key like 'event_world_week:%'), 500,
  'the third country completes the event');
select is((select count(*)::int from discovery_points where kind = 'challenge' and award_key like 'day_two_countries:%'), 1,
  'and the daily mission is not paid twice');
insert into discovery_points (user_id, kind, award_key, points) values ('00000000-0000-0000-0000-0000000000a9', 'daily_complete', 'daily:test', 100);
select ok(exists (select 1 from discovery_points where award_key like 'day_daily_set:%'), 'completing Daily Discovery is a mission too');

-- Badges.
insert into discovery_points (user_id, kind, award_key, points, created_at)
select '00000000-0000-0000-0000-0000000000a9', 'underground', 'u' || n, 40, now() from generate_series(1, 50) n;
insert into listening_daily (user_id, day, ms_played, plays, tracks, artists, hours)
values ('00000000-0000-0000-0000-0000000000a9', current_date, 1, 120, 1, 1,
  array[20,20,20,10,0,0,0,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,20,20]);
set local role authenticated;
select ok(refresh_my_achievements() @> array['underground_hunter'], 'Underground Hunter after 50 small artists');
select ok(exists (select 1 from user_achievements where code = 'night_listener'), 'Night Listener: most plays between 22:00 and 05:00');
select ok(not exists (select 1 from user_achievements where code = 'discovery_machine'), 'Discovery Machine needs 150 songs in a week');

select * from finish();
rollback;
