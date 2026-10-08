-- Discover P2: seasonal rankings and weekly challenges (docs/discovery-expansion.md, "Seasons and
-- challenges"). Both are built on the discovery ledger, so they reward discovering — never time
-- spent listening — and inherit its anti-abuse rules (qualifying listens, per-minute and daily caps).
--
-- Seasons are calendar quarters (UTC): one ranking per quarter, closed by a daily pg_cron job into
-- season_results (each participant's final place, private to them). Weekly challenges: three per
-- UTC week, the same for everyone, picked deterministically from discovery_challenges; progress is
-- counted from the ledger, and reaching a target awards 'challenge' points once per week.

-- ---------------------------------------------------------------------------
-- Ledger: a 'challenge' award kind
-- ---------------------------------------------------------------------------
alter table public.discovery_point_rules drop constraint discovery_point_rules_kind;
alter table public.discovery_point_rules add constraint discovery_point_rules_kind check (kind in (
  'new_song', 'new_artist', 'new_genre', 'new_country', 'save', 'full_listen', 'share', 'challenge'
));
-- Three challenges a week; the cap only guards against a misconfigured rotation.
insert into public.discovery_point_rules (kind, points, daily_cap) values ('challenge', 20, 60);

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
create or replace function private.period_bounds(period text, out starts timestamptz, out ends timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    case period
      when 'week' then date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
      when 'last_week' then (date_trunc('week', now() at time zone 'UTC') - interval '7 days') at time zone 'UTC'
      when 'month' then date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      when 'season' then date_trunc('quarter', now() at time zone 'UTC') at time zone 'UTC'
      when 'last_season' then (date_trunc('quarter', now() at time zone 'UTC') - interval '3 months') at time zone 'UTC'
      else '-infinity'::timestamptz
    end,
    case period
      when 'last_week' then date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
      when 'last_season' then date_trunc('quarter', now() at time zone 'UTC') at time zone 'UTC'
      else 'infinity'::timestamptz
    end;
$$;

create or replace function public.discovery_leaderboard(
  period text default 'week',
  country text default null,
  macro_region text default null,
  max_results integer default 50
)
returns table (rank integer, handle text, display_name text, points integer, discoveries integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.rank, pr.handle::text, pr.display_name, s.points, s.discoveries, s.user_id = (select auth.uid())
  from private.period_scores(period, country, macro_region) s
  join public.profiles pr on pr.id = s.user_id and pr.deleted_at is null and pr.handle is not null
  left join public.listener_preferences lp on lp.user_id = s.user_id
  where coalesce(lp.show_in_rankings, true)
    and period in ('week', 'last_week', 'month', 'season', 'last_season', 'all')
  order by s.rank, pr.handle
  limit least(greatest(max_results, 1), 100);
$$;

/** Final global standings of closed seasons; each listener reads only their own rows. */
create table public.season_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_start date not null constraint season_results_quarter check (
    extract(day from season_start) = 1 and extract(month from season_start)::integer in (1, 4, 7, 10)),
  points integer not null,
  discoveries integer not null,
  rank integer not null,
  participants integer not null,
  -- Share of participants with fewer points.
  percentile smallint not null constraint season_results_percentile check (percentile between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, season_start)
);

create index season_results_season_idx on public.season_results (season_start, rank);

alter table public.season_results enable row level security;
revoke all on public.season_results from anon, authenticated;
grant select on public.season_results to authenticated;

create policy "Listeners read their own season results"
  on public.season_results for select to authenticated
  using (user_id = (select auth.uid()));

/**
 * Closes the season before the current one (idempotent: a closed season is left as it is), then
 * re-checks achievements of everyone placed. Run daily by pg_cron, so a new quarter's first run
 * closes the previous one. Returns the number of results written.
 */
create function private.close_last_season()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season date := ((date_trunc('quarter', now() at time zone 'UTC') - interval '3 months'))::date;
  written integer;
  person uuid;
begin
  if exists (select 1 from public.season_results r where r.season_start = season) then
    return 0;
  end if;
  insert into public.season_results (user_id, season_start, points, discoveries, rank, participants, percentile)
  select s.user_id, season, s.points, s.discoveries, s.rank, count(*) over (),
    (100 * (count(*) over (order by s.points range between unbounded preceding and 1 preceding))
      / greatest(count(*) over (), 1))::smallint
  from private.period_scores('last_season', null, null) s;
  get diagnostics written = row_count;
  for person in select r.user_id from public.season_results r where r.season_start = season and r.percentile >= 90 loop
    perform private.evaluate_achievements(person);
  end loop;
  return written;
end;
$$;

revoke execute on function private.close_last_season() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Weekly challenges
-- ---------------------------------------------------------------------------
create table public.discovery_challenges (
  code text primary key constraint discovery_challenges_code check (code ~ '^[a-z_]{2,40}$'),
  metric text not null constraint discovery_challenges_metric check (metric in (
    'new_songs', 'new_artists', 'new_genres', 'new_countries', 'regions', 'saves', 'shares',
    'full_listens', 'small_artists', 'days'
  )),
  target integer not null constraint discovery_challenges_target check (target between 1 and 1000),
  -- Turn off between weeks: the rotation of the running week is picked from the enabled ones.
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger discovery_challenges_set_updated_at
  before update on public.discovery_challenges
  for each row execute function private.set_updated_at();

alter table public.discovery_challenges enable row level security;
revoke all on public.discovery_challenges from anon, authenticated;
grant select on public.discovery_challenges to anon, authenticated;

create policy "Challenges are public"
  on public.discovery_challenges for select to anon, authenticated
  using (true);

insert into public.discovery_challenges (code, metric, target) values
  ('thirty_songs', 'new_songs', 30),
  ('ten_artists', 'new_artists', 10),
  ('three_genres', 'new_genres', 3),
  ('three_countries', 'new_countries', 3),
  ('two_regions', 'regions', 2),
  ('five_saves', 'saves', 5),
  ('two_shares', 'shares', 2),
  ('five_full_listens', 'full_listens', 5),
  ('small_artists', 'small_artists', 3),
  ('five_days', 'days', 5);

/** Monday (UTC) of the running challenge week. */
create function private.challenge_week()
returns date
language sql
stable
set search_path = ''
as $$ select date_trunc('week', now() at time zone 'UTC')::date $$;

revoke execute on function private.challenge_week() from public, anon, authenticated;

/** The week's three challenges: a stable, pseudo-random pick from the enabled ones. */
create function private.active_challenges(week date)
returns setof public.discovery_challenges
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.discovery_challenges c
  where c.enabled
  order by md5(c.code || ':' || week::text)
  limit 3;
$$;

revoke execute on function private.active_challenges(date) from public, anon, authenticated;

/** Progress of one listener on the week's challenges, counted from the ledger. */
create function private.challenge_progress(listener uuid, week date)
returns table (code text, metric text, target integer, progress integer)
language sql
stable
security definer
set search_path = ''
as $$
  with dp as (
    select p.* from public.discovery_points p
    where p.user_id = listener
      and p.created_at >= week::timestamp at time zone 'UTC'
      and p.created_at < (week + 7)::timestamp at time zone 'UTC'
  ), m as (
    select
      count(*) filter (where kind = 'new_song') as new_songs,
      count(*) filter (where kind = 'new_artist') as new_artists,
      count(*) filter (where kind = 'new_genre') as new_genres,
      count(*) filter (where kind = 'new_country') as new_countries,
      count(*) filter (where kind = 'save') as saves,
      count(*) filter (where kind = 'share') as shares,
      count(*) filter (where kind = 'full_listen') as full_listens,
      -- Artists with at most 50 followers when the listener found them.
      count(*) filter (where kind = 'new_artist' and artist_followers_at <= 50) as small_artists,
      count(distinct (created_at at time zone private.listener_tz(listener))::date)
        filter (where kind = 'new_song') as days,
      (select count(distinct c.region) from dp x
        join public.artists a on a.id = x.artist_id
        join public.countries c on c.code = a.country_code
        where x.kind = 'new_artist') as regions
    from dp
  )
  select c.code, c.metric, c.target,
    (case c.metric
      when 'new_songs' then m.new_songs
      when 'new_artists' then m.new_artists
      when 'new_genres' then m.new_genres
      when 'new_countries' then m.new_countries
      when 'regions' then m.regions
      when 'saves' then m.saves
      when 'shares' then m.shares
      when 'full_listens' then m.full_listens
      when 'small_artists' then m.small_artists
      when 'days' then m.days
    end)::integer
  from private.active_challenges(week) c, m;
$$;

revoke execute on function private.challenge_progress(uuid, date) from public, anon, authenticated;

/** Awards every reached challenge of the running week (once per challenge and week). */
create function private.evaluate_challenges(listener uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  week date := private.challenge_week();
  done record;
begin
  for done in
    select p.code from private.challenge_progress(listener, week) p where p.progress >= p.target
  loop
    perform private.award(listener, 'challenge', done.code || ':' || week::text);
  end loop;
end;
$$;

revoke execute on function private.evaluate_challenges(uuid) from public, anon, authenticated;

/** Every award (listen, save, share) may complete a challenge — except a challenge award itself. */
create function private.discovery_points_challenges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.evaluate_challenges(new.user_id);
  return null;
end;
$$;

create trigger discovery_points_challenges
  after insert on public.discovery_points
  for each row when (new.kind <> 'challenge' and new.points > 0)
  execute function private.discovery_points_challenges();

/**
 * This week's challenges with the caller's progress (visitors see them with zero progress) and,
 * when done, when — so the app can celebrate a fresh completion once.
 */
create function public.my_challenges()
returns table (code text, metric text, target integer, progress integer, completed_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with week as (select private.challenge_week() as d)
  select p.code, p.metric, p.target,
    least(p.progress, p.target),
    (select dp.created_at from public.discovery_points dp
      where dp.user_id = (select auth.uid()) and dp.kind = 'challenge'
        and dp.award_key = p.code || ':' || week.d::text),
    (week.d + 7)::timestamp at time zone 'UTC'
  from week, private.challenge_progress((select auth.uid()), week.d) p
  order by p.code;
$$;

revoke execute on function public.my_challenges() from public;
grant execute on function public.my_challenges() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Achievements: completed challenges and a top-10 % season finish
-- ---------------------------------------------------------------------------
alter table public.achievements drop constraint achievements_metric;
alter table public.achievements add constraint achievements_metric check (metric in (
  'songs', 'artists', 'genres', 'countries', 'longest_streak', 'deep_genre', 'early_supporter', 'saves',
  'challenges', 'season_top10'
));

insert into public.achievements (code, metric, threshold, position) values
  ('challenger', 'challenges', 10, 130),
  ('season_star', 'season_top10', 1, 140);

create or replace function private.evaluate_achievements(listener uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  metrics jsonb;
  unlocked text[];
begin
  select jsonb_build_object(
    'songs', count(*) filter (where p.kind = 'new_song'),
    'artists', count(*) filter (where p.kind = 'new_artist'),
    'genres', count(*) filter (where p.kind = 'new_genre'),
    'countries', count(*) filter (where p.kind = 'new_country'),
    'saves', count(*) filter (where p.kind = 'save'),
    'challenges', count(*) filter (where p.kind = 'challenge'),
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
    -- A top-10 % finish among at least 10 participants.
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

-- ---------------------------------------------------------------------------
-- Schedule: close the last season daily (a no-op except on a quarter's first run)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('season-close', '20 0 * * *', 'select private.close_last_season()');
  end if;
end;
$$;
