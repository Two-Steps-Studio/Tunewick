-- M14.8: friends' rankings, activity, common ground and profiles, all behind the owner's switches.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000008a1', 'social-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008a2', 'social-me@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008a3', 'social-friend@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
update profiles set handle = 'socialme' where id = '00000000-0000-0000-0000-0000000008a2';
update profiles set handle = 'socialfriend' where id = '00000000-0000-0000-0000-0000000008a3';
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Social', 'social-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'social', 'Social', 'single');
insert into ids select 'release', id from releases where slug = 'social' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Jeden'));

-- Both listen to the same artist; the friend discovered it and has a badge.
set local role postgres;
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select u, (select id from ids where name = 'track'), (select id from ids where name = 'release'),
  (select id from ids where name = 'artist'), now() - interval '1 day', 200000, true, false
from unnest(array['00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a3']::uuid[]) u;
insert into discovery_points (user_id, kind, award_key, points, artist_id)
values ('00000000-0000-0000-0000-0000000008a3', 'new_artist', 'x', 30, (select id from ids where name = 'artist'));
insert into user_achievements (user_id, code) select '00000000-0000-0000-0000-0000000008a3', code from achievements limit 1;
insert into user_follows (follower_id, followee_id) values ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a3');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008a2", "role": "authenticated"}';
select is((select count(*)::int from friends_leaderboard('week')), 2, 'me and the person I follow');
select is((select handle from friends_leaderboard('week') where rank = 1), 'socialfriend', 'ranked by XP');
select is((select count(*)::int from friends_activity()), 2, 'their new artist and their badge');
select is((common_ground('socialfriend')->'artists'->0->>'name'), 'Social', 'an artist we share');
select is((common_ground('socialfriend')->>'match')::numeric, 1.00, 'all our artists are shared');
select is((profile_overview('socialfriend')->'score'->>'xp')::int, 30, 'their XP is public');

set local role postgres;
insert into listening_replays (user_id, year, data) values ('00000000-0000-0000-0000-0000000008a3', 2025,
  '{"stats": {"listening_ms": 600000, "new_artists": 3, "top_artists": [{"name": "Social"}]}}');
set local role authenticated;
select is((profile_overview('socialfriend')->'replay'->>'minutes')::int, 10, 'their last Replay, for followers');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(profile_overview('socialfriend')->'replay', 'null'::jsonb, 'but not for visitors');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008a2", "role": "authenticated"}';

-- The friend hides stats and score.
set local role postgres;
update profile_settings set stats_visibility = 'private', score_visibility = 'private'
where user_id = '00000000-0000-0000-0000-0000000008a3';
set local role authenticated;
select is((select count(*)::int from friends_activity() where kind = 'new_artist'), 0, 'private stats hide discoveries');
select is((select count(*)::int from friends_activity() where kind = 'badge'), 1, 'badges follow their own switch');
select is((select count(*)::int from friends_leaderboard('week')), 1, 'a private score leaves the friends ranking');
select is(common_ground('socialfriend'), null, 'no common ground without visible stats');
select is(profile_overview('socialfriend')->'score', 'null'::jsonb, 'nor a score on the profile');

-- A private profile hides everything, even public badges.
set local role postgres;
update profile_settings set profile_public = false where user_id = '00000000-0000-0000-0000-0000000008a3';
set local role authenticated;
select is((select count(*)::int from friends_activity()), 0, 'a private profile shows no activity');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$ select * from friends_activity() $$, '42501', null, 'visitors have no friends feed');

select * from finish();
rollback;
