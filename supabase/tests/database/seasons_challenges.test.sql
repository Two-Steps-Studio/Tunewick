-- Seasons (quarter rankings closed into season_results) and weekly challenges from the ledger.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

-- Ten listeners: d01 … d10.
insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-000000000d' || lpad(n::text, 2, '0'))::uuid, 'sc-' || n || '@test.local',
  '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 10) n;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------
update discovery_challenges set enabled = code in ('three_genres', 'five_saves', 'two_shares');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from my_missions() where cadence = 'weekly'), 3, 'three weekly missions, visible to visitors');
select is((select sum(progress)::int from my_missions()), 0, 'visitors have no progress');
select ok((select bool_and(ends_at = (date_trunc('week', now() at time zone 'UTC') + interval '7 days') at time zone 'UTC') from my_missions()),
  'weekly missions end with the UTC week');

set local role postgres;
insert into discovery_points (user_id, kind, award_key, points, genre_id)
select '00000000-0000-0000-0000-000000000d01', 'new_genre', 'g' || n, 5, null from generate_series(1, 2) n;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000d01", "role": "authenticated"}';
select is((select row(progress, completed_at is null)::text from my_missions() where code = 'three_genres'), '(2,t)',
  'progress counts this week''s ledger');

set local role postgres;
insert into discovery_points (user_id, kind, award_key, points) values ('00000000-0000-0000-0000-000000000d01', 'new_genre', 'g3', 5);
-- Old discoveries do not count for this week.
insert into discovery_points (user_id, kind, award_key, points, created_at)
values ('00000000-0000-0000-0000-000000000d01', 'save', 'old', 2, now() - interval '8 days');

set local role authenticated;
select ok((select completed_at is not null from my_missions() where code = 'three_genres'), 'reaching the target completes it');
select is((select progress from my_missions() where code = 'five_saves'), 0, 'last week''s saves are not this week''s');
select is((select points::int from discovery_points where kind = 'challenge'), 200, 'a completed mission pays its own XP');

set local role postgres;
insert into discovery_points (user_id, kind, award_key, points) values ('00000000-0000-0000-0000-000000000d01', 'new_genre', 'g4', 5);
select is((select count(*)::int from discovery_points where kind = 'challenge'), 1, 'once per challenge and week');

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
-- Last quarter: listener n earns n points; this quarter's points belong to the running season.
insert into discovery_points (user_id, kind, award_key, points, created_at)
select ('00000000-0000-0000-0000-000000000d' || lpad(n::text, 2, '0'))::uuid, 'new_song', 'last-season-' || n, n,
  (date_trunc('quarter', now() at time zone 'UTC') - interval '10 days') at time zone 'UTC'
from generate_series(1, 10) n;

select is(private.close_last_season(), 10, 'closing the last season writes every participant');
select is(private.close_last_season(), 0, 'a closed season stays closed');
select is((select row(rank, participants, percentile)::text from season_results where user_id = '00000000-0000-0000-0000-000000000d10'),
  '(1,10,90)', 'the winner: first of ten, more points than 90 %');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000d10", "role": "authenticated"}';
select is((select count(*)::int from season_results), 1, 'listeners see only their own results');
select ok(exists (select 1 from user_achievements where code = 'season_star'), 'a top-10 % finish unlocks Season Star');
select is((select rank from my_ranking('last_season')), 1, 'the last season stays a ranking period');

select * from finish();
rollback;
