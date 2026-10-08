-- M14.4 Missions and badges (docs/discovery-v2.md §2 V7, V8).
--
-- Weekly challenges become missions with a cadence — daily, weekly, monthly, or a special event
-- with its own time window — and their own XP. The rotation stays shared (everyone gets the same
-- missions of a period; periods are UTC), progress is counted from the ledger, and a mission pays
-- once per period. New badges: Underground Hunter, Night Listener, Discovery Machine, Year
-- Explorer, Globetrotter.

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------
alter table public.discovery_challenges
  add column cadence text not null default 'weekly'
    constraint discovery_challenges_cadence check (cadence in ('daily', 'weekly', 'monthly', 'event')),
  add column xp integer not null default 200
    constraint discovery_challenges_xp check (xp between 10 and 2000),
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add constraint discovery_challenges_event_window check (
    (cadence = 'event') = (starts_at is not null and ends_at is not null and ends_at > starts_at));

alter table public.discovery_challenges drop constraint discovery_challenges_metric;
alter table public.discovery_challenges add constraint discovery_challenges_metric check (metric in (
  'new_songs', 'new_artists', 'new_genres', 'new_countries', 'regions', 'saves', 'shares',
  'full_listens', 'small_artists', 'days', 'underground', 'artist_countries', 'daily_set'
));

update public.discovery_challenges set xp = case code
  when 'thirty_songs' then 300 when 'ten_artists' then 250 when 'three_genres' then 200
  when 'three_countries' then 250 when 'two_regions' then 200 when 'five_saves' then 150
  when 'two_shares' then 150 when 'five_full_listens' then 150 when 'small_artists' then 300
  when 'five_days' then 250 else xp end;

insert into public.discovery_challenges (code, metric, target, cadence, xp) values
  -- Daily
  ('day_five_songs', 'new_songs', 5, 'daily', 100),
  ('day_three_artists', 'new_artists', 3, 'daily', 100),
  ('day_new_genre', 'new_genres', 1, 'daily', 100),
  ('day_daily_set', 'daily_set', 1, 'daily', 100),
  ('day_underground', 'underground', 1, 'daily', 150),
  ('day_two_countries', 'artist_countries', 2, 'daily', 150),
  -- Weekly (from the brief)
  ('week_five_artists', 'new_artists', 5, 'weekly', 100),
  ('week_three_countries', 'artist_countries', 3, 'weekly', 150),
  ('week_ten_songs', 'new_songs', 10, 'weekly', 250),
  ('week_underground', 'underground', 1, 'weekly', 300),
  -- Monthly
  ('month_fifty_artists', 'new_artists', 50, 'monthly', 600),
  ('month_ten_countries', 'new_countries', 10, 'monthly', 600),
  ('month_twenty_days', 'days', 20, 'monthly', 700),
  ('month_ten_underground', 'underground', 10, 'monthly', 700),
  ('month_ten_genres', 'new_genres', 10, 'monthly', 600);

-- Several missions can finish on one day: the 24-hour cap is a guard, not a limit people meet.
update public.discovery_point_rules set daily_cap = 3000 where kind = 'challenge';

/** Like private.award, with the points given by the caller (a mission's XP); same cap rule. */
create function private.award_points(listener uuid, award_kind text, key text, amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.discovery_point_rules%rowtype;
  earned integer;
  granted integer;
begin
  select * into rule from public.discovery_point_rules r where r.kind = award_kind;
  if not found or not rule.enabled then
    return null;
  end if;
  select coalesce(sum(p.points), 0) into earned
  from public.discovery_points p
  where p.user_id = listener and p.kind = award_kind and p.created_at > now() - interval '24 hours';
  granted := greatest(0, least(amount, rule.daily_cap - earned));
  insert into public.discovery_points (user_id, kind, award_key, points)
  values (listener, award_kind, key, granted)
  on conflict (user_id, kind, award_key) do nothing
  returning points into granted;
  return granted;
end;
$$;

revoke execute on function private.award_points(uuid, text, text, integer) from public, anon, authenticated;

/** Start (inclusive) and end (exclusive) of the current period of a cadence, UTC. */
create function private.mission_period(cadence text, out starts timestamptz, out ends timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    date_trunc(case cadence when 'daily' then 'day' when 'weekly' then 'week' else 'month' end,
      now() at time zone 'UTC') at time zone 'UTC',
    (date_trunc(case cadence when 'daily' then 'day' when 'weekly' then 'week' else 'month' end,
      now() at time zone 'UTC')
      + case cadence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end)
      at time zone 'UTC';
$$;

revoke execute on function private.mission_period(text) from public, anon, authenticated;

/**
 * The missions running now: per cadence a stable pick for the period (daily 3, weekly 3,
 * monthly 2) from the enabled ones, plus every event inside its window.
 */
create function private.active_missions()
returns table (code text, metric text, target integer, xp integer, cadence text, starts timestamptz, ends timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select x.code, x.metric, x.target, x.xp, x.cadence, x.starts, x.ends from (
    select c.code, c.metric, c.target, c.xp, c.cadence, p.starts, p.ends,
      row_number() over (partition by c.cadence order by md5(c.code || ':' || p.starts::text)) as n
    from public.discovery_challenges c
    cross join lateral private.mission_period(c.cadence) p
    where c.enabled and c.cadence in ('daily', 'weekly', 'monthly')
  ) x
  where x.n <= case x.cadence when 'monthly' then 2 else 3 end
  union all
  select c.code, c.metric, c.target, c.xp, c.cadence, c.starts_at, c.ends_at
  from public.discovery_challenges c
  where c.enabled and c.cadence = 'event' and now() >= c.starts_at and now() < c.ends_at;
$$;

revoke execute on function private.active_missions() from public, anon, authenticated;

/** A listener's progress on one metric between two instants, counted from the ledger. */
create function private.mission_metric(listener uuid, metric text, starts timestamptz, ends timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with dp as (
    select p.* from public.discovery_points p
    where p.user_id = listener and p.created_at >= starts and p.created_at < ends
  )
  select (case metric
    when 'new_songs' then (select count(*) from dp where kind = 'new_song')
    when 'new_artists' then (select count(*) from dp where kind = 'new_artist')
    when 'new_genres' then (select count(*) from dp where kind = 'new_genre')
    when 'new_countries' then (select count(*) from dp where kind = 'new_country')
    when 'saves' then (select count(*) from dp where kind = 'save')
    when 'shares' then (select count(*) from dp where kind = 'share')
    when 'full_listens' then (select count(*) from dp where kind = 'full_listen')
    when 'underground' then (select count(*) from dp where kind = 'underground')
    when 'daily_set' then (select count(*) from dp where kind = 'daily_complete')
    when 'small_artists' then (select count(*) from dp where kind = 'new_artist' and artist_followers_at <= 50)
    when 'days' then (
      select count(distinct (created_at at time zone private.listener_tz(listener))::date) from dp where kind = 'new_song')
    when 'artist_countries' then (
      select count(distinct a.country_code) from dp
      join public.artists a on a.id = dp.artist_id
      where dp.kind = 'new_artist' and a.country_code is not null)
    when 'regions' then (
      select count(distinct c.region) from dp
      join public.artists a on a.id = dp.artist_id
      join public.countries c on c.code = a.country_code
      where dp.kind = 'new_artist')
    else 0
  end)::integer;
$$;

revoke execute on function private.mission_metric(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

/** Pays every reached mission of the running periods (once per mission and period). */
create function private.evaluate_missions(listener uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  for m in select * from private.active_missions() loop
    if private.mission_metric(listener, m.metric, m.starts, m.ends) >= m.target then
      perform private.award_points(listener, 'challenge', m.code || ':' || (m.starts at time zone 'UTC')::date::text, m.xp);
    end if;
  end loop;
end;
$$;

revoke execute on function private.evaluate_missions(uuid) from public, anon, authenticated;

create or replace function private.discovery_points_challenges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.evaluate_missions(new.user_id);
  return null;
end;
$$;

/** The missions running now with the caller's progress (visitors: zero progress). */
create function public.my_missions()
returns table (
  cadence text, code text, metric text, target integer, xp integer, progress integer,
  completed_at timestamptz, ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.cadence, m.code, m.metric, m.target, m.xp,
    least(private.mission_metric((select auth.uid()), m.metric, m.starts, m.ends), m.target),
    (select dp.created_at from public.discovery_points dp
      where dp.user_id = (select auth.uid()) and dp.kind = 'challenge'
        and dp.award_key = m.code || ':' || (m.starts at time zone 'UTC')::date::text),
    m.ends
  from private.active_missions() m
  order by array_position(array['daily', 'weekly', 'monthly', 'event'], m.cadence), m.xp, m.code;
$$;

revoke execute on function public.my_missions() from public;
grant execute on function public.my_missions() to anon, authenticated;

-- The weekly-only API is replaced by missions.
drop function public.my_challenges();
drop function private.evaluate_challenges(uuid);
drop function private.challenge_progress(uuid, date);
drop function private.active_challenges(date);
drop function private.challenge_week();

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
alter table public.achievements drop constraint achievements_metric;
alter table public.achievements add constraint achievements_metric check (metric in (
  'songs', 'artists', 'genres', 'countries', 'longest_streak', 'deep_genre', 'early_supporter', 'saves',
  'challenges', 'season_top10', 'underground', 'night', 'best_week_songs', 'year_discovery_xp'
));

insert into public.achievements (code, metric, threshold, position) values
  ('globetrotter', 'countries', 10, 75),
  ('underground_hunter', 'underground', 50, 125),
  ('night_listener', 'night', 1, 150),
  ('discovery_machine', 'best_week_songs', 150, 160),
  ('year_explorer', 'year_discovery_xp', 20000, 170);

create or replace function private.evaluate_achievements(listener uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  metrics jsonb;
  unlocked text[];
  night integer;
begin
  -- Night Listener: at least 100 plays, 40 % or more between 22:00 and 05:00 local time.
  select case when sum(total) >= 100 and sum(late) >= 0.4 * sum(total) then 1 else 0 end into night
  from (
    select (select sum(h) from unnest(d.hours) h) as total,
      d.hours[23] + d.hours[24] + d.hours[1] + d.hours[2] + d.hours[3] + d.hours[4] + d.hours[5] as late
    from public.listening_daily d where d.user_id = listener
  ) x;

  select jsonb_build_object(
    'songs', count(*) filter (where p.kind = 'new_song'),
    'artists', count(*) filter (where p.kind = 'new_artist'),
    'genres', count(*) filter (where p.kind = 'new_genre'),
    'countries', count(*) filter (where p.kind = 'new_country'),
    'saves', count(*) filter (where p.kind = 'save'),
    'challenges', count(*) filter (where p.kind = 'challenge'),
    'underground', count(*) filter (where p.kind = 'underground'),
    'night', coalesce(night, 0),
    'year_discovery_xp', coalesce(sum(p.points) filter (where p.kind in (
      'new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')
      and p.created_at >= date_trunc('year', now())), 0),
    'best_week_songs', coalesce((
      select max(n) from (
        select count(*) as n from public.discovery_points w
        where w.user_id = listener and w.kind = 'new_song'
        group by date_trunc('week', w.created_at)) weeks), 0),
    'longest_streak', (select s.longest_streak from private.streaks(listener) s),
    'deep_genre', coalesce((
      select max(n) from (
        select count(distinct a.artist_id) as n
        from public.discovery_points a
        join public.artist_genres g on g.artist_id = a.artist_id
        where a.user_id = listener and a.kind = 'new_artist'
        group by g.genre_id
      ) per_genre), 0),
    'early_supporter', (
      select count(*) from public.discovery_points a
      where a.user_id = listener and a.kind = 'new_artist' and a.artist_followers_at <= 25
        and (select count(*) from public.artist_follows f where f.artist_id = a.artist_id) >= 100),
    'season_top10', (
      select count(*) from public.season_results r
      where r.user_id = listener and r.percentile >= 90 and r.participants >= 10)
  ) into metrics
  from public.discovery_points p
  where p.user_id = listener;

  with fresh as (
    insert into public.user_achievements (user_id, code)
    select listener, a.code from public.achievements a
    where coalesce((metrics ->> a.metric)::integer, 0) >= a.threshold
    on conflict do nothing
    returning code
  )
  select coalesce(array_agg(code), '{}') into unlocked from fresh;
  return unlocked;
end;
$$;
