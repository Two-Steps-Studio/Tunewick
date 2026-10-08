-- M14.3 Daily Discovery / Weekly Drop: stable per period, completed by real discoveries only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000005e1', 'sets-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005e2', 'sets-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005e1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Zestaw', 'zestaw-test'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'zestaw', 'Zestaw', 'album'),
  ((select id from ids where name = 'artist'), 'szkic-z', 'Szkic', 'single');
insert into ids select 'release', id from releases where slug = 'zestaw';
insert into ids select 'draft', id from releases where slug = 'szkic-z';
insert into ids select 't' || n, add_track((select id from ids where name = 'release'), 'Utwór ' || n) from generate_series(1, 6) n;
insert into ids values ('hidden', add_track((select id from ids where name = 'draft'), 'Ukryty'));
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'release');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005e2", "role": "authenticated"}';
select is((select count(*)::int from my_discovery_set('daily')), 0, 'no set before the first visit of the day');
select is((select row(jsonb_array_length(items), progress, target)::text from save_discovery_set('daily',
  (select jsonb_agg(jsonb_build_object('track_id', id, 'section', 'new')) from ids where name like 't%' or name = 'hidden'))),
  '(6,0,5)', 'today''s set keeps public songs only; done at 5 discoveries');
select is((select jsonb_array_length(items) from save_discovery_set('daily',
  jsonb_build_array(jsonb_build_object('track_id', (select id from ids where name = 't1'))))),
  6, 'the set does not change within the day');
select lives_ok($$select save_discovery_set('weekly', (select jsonb_agg(jsonb_build_object('track_id', id, 'section', 'underground')) from ids where name like 't%'))$$,
  'the weekly drop is stored too');
select throws_ok($$select * from save_discovery_set('monthly', '[]')$$, '22023', null, 'only daily and weekly');

-- Discoveries (as the database records them from listens).
set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, track_id)
select '00000000-0000-0000-0000-0000000005e2', 'new_song', id::text, 10, id from ids where name in ('t1', 't2', 't3', 't4');
set local role authenticated;
select is((select row(progress, completed_at is null)::text from my_discovery_set('daily')), '(4,t)', 'four of five');
set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, track_id)
values ('00000000-0000-0000-0000-0000000005e2', 'new_song', (select id::text from ids where name = 't5'), 10, (select id from ids where name = 't5'));
set local role authenticated;
select ok((select completed_at is not null from my_discovery_set('daily')), 'the fifth discovery completes Daily Discovery');
select is((select points::int from discovery_points where kind = 'daily_complete'), 100, '+100 XP, once');
select is((select completed_at is null from my_discovery_set('weekly')), true, 'the weekly drop needs all six here (fewer than ten songs)');
set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, track_id)
values ('00000000-0000-0000-0000-0000000005e2', 'new_song', (select id::text from ids where name = 't6'), 10, (select id from ids where name = 't6'));
set local role authenticated;
select is((select points::int from discovery_points where kind = 'weekly_complete'), 250, 'Weekly Drop complete: +250 XP');
select is((select count(*)::int from discovery_points where kind = 'daily_complete'), 1, 'Daily Discovery pays once');

select * from finish();
rollback;
