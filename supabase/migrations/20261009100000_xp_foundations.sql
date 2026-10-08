-- M14.1 foundations (docs/discovery-v2.md §2 V1, V2, V9).
--
-- XP and Discovery Score: the ledger stays the single source; point values are ×10 so XP reads
-- naturally (+30 XP for a new artist, missions +100…+300 XP). XP = every ledger entry; Discovery
-- Score = discovery kinds only (my_progress.discovery_points_total) × diversity, computed in
-- @tunewick/shared. New kind 'underground': finding an artist with < 10,000 listeners (30 days).
--
-- Per-listener daily listening aggregates (listener's own days), refreshed incrementally every
-- 10 minutes, so statistics, recaps and Replay never scan raw history on page load.
--
-- Privacy: separate switches for the profile, statistics, Discovery Score, badges and Replay.

-- ---------------------------------------------------------------------------
-- XP scale and the underground kind
-- ---------------------------------------------------------------------------
alter table public.discovery_point_rules drop constraint discovery_point_rules_kind;
alter table public.discovery_point_rules add constraint discovery_point_rules_kind check (kind in (
  'new_song', 'new_artist', 'new_genre', 'new_country', 'save', 'full_listen', 'share', 'challenge',
  'underground'
));
alter table public.discovery_point_rules drop constraint discovery_point_rules_points;
alter table public.discovery_point_rules add constraint discovery_point_rules_points
  check (points between 0 and 1000);
alter table public.discovery_point_rules alter column daily_cap type integer;

update public.discovery_point_rules set points = points * 10, daily_cap = daily_cap * 10;
insert into public.discovery_point_rules (kind, points, daily_cap) values ('underground', 40, 400);

update public.discovery_points set points = points * 10;

/**
 * Listeners of an artist in the last 30 days, counted up to `cap` (enough to tell "under cap"
 * without counting a big artist's whole audience).
 */
create function private.artist_listeners_30d(artist uuid, cap integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from (
    select distinct e.user_id from public.listening_events e
    where e.artist_id = artist and e.started_at > now() - interval '30 days'
      and (e.ms_played >= 30000 or e.completed) and not e.soundcheck
    limit cap
  ) l;
$$;

revoke execute on function private.artist_listeners_30d(uuid, integer) from public, anon, authenticated;

create or replace function private.award_listen(
  listener uuid,
  track uuid,
  ms_played integer,
  completed boolean,
  soundcheck boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  awards jsonb := '[]'::jsonb;
  granted integer;
  genre smallint;
  qualifies boolean;
  unlocked text[] := '{}'::text[];
begin
  select tr.id, tr.soundcheck_duration_ms, r.id as release_id, a.id as artist_id, a.country_code
  into t
  from public.tracks tr
  join public.releases r on r.id = tr.release_id
  join public.artists a on a.id = r.artist_id
  where tr.id = track;

  qualifies := ms_played >= 15000
    or (soundcheck and completed and ms_played >= coalesce(t.soundcheck_duration_ms, 15000) - 2000);
  if not qualifies then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;

  -- Full listen of recently discovered music (player only).
  if completed and not soundcheck and exists (
    select 1 from public.discovery_points p
    where p.user_id = listener and p.kind = 'new_song' and p.track_id = track
      and p.created_at > now() - interval '30 days'
  ) then
    granted := private.award(listener, 'full_listen',
      track::text || ':' || (now() at time zone private.listener_tz(listener))::date::text, track, t.artist_id);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'full_listen', 'points', granted);
    end if;
  end if;

  if exists (select 1 from public.discovery_points p where p.user_id = listener and p.kind = 'new_song' and p.track_id = track) then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;
  if (select count(*) from public.discovery_points p
      where p.user_id = listener and p.kind = 'new_song' and p.created_at > now() - interval '1 minute')
     >= private.max_discoveries_per_minute() then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked), 'throttled', true);
  end if;

  granted := private.award(listener, 'new_song', track::text, track, t.artist_id);
  if granted is null then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;
  awards := awards || jsonb_build_object('kind', 'new_song', 'points', granted);

  granted := private.award(listener, 'new_artist', t.artist_id::text, track, t.artist_id, null, null,
    (select count(*)::integer from public.artist_follows f where f.artist_id = t.artist_id));
  if granted is not null then
    awards := awards || jsonb_build_object('kind', 'new_artist', 'points', granted);
    -- Underground: the artist had fewer than 10,000 listeners in the last 30 days when found.
    if private.artist_listeners_30d(t.artist_id, 10000) < 10000 then
      granted := private.award(listener, 'underground', t.artist_id::text, track, t.artist_id);
      if granted is not null then
        awards := awards || jsonb_build_object('kind', 'underground', 'points', granted);
      end if;
    end if;
  end if;

  for genre in
    select g.genre_id from public.release_genres g where g.release_id = t.release_id
    union
    select g.genre_id from public.artist_genres g
    where g.artist_id = t.artist_id
      and not exists (select 1 from public.release_genres rg where rg.release_id = t.release_id)
  loop
    granted := private.award(listener, 'new_genre', genre::text, track, t.artist_id, genre);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'new_genre', 'points', granted, 'genre', genre);
    end if;
  end loop;

  if t.country_code is not null then
    granted := private.award(listener, 'new_country', t.country_code, track, t.artist_id, null, t.country_code);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'new_country', 'points', granted, 'country', t.country_code);
    end if;
  end if;

  unlocked := private.evaluate_achievements(listener);
  return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
end;
$$;

create or replace function public.my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
  local_now timestamp;
  day_start timestamptz;
  week_start timestamptz;
  result jsonb;
  streak record;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  tz := private.listener_tz(me);
  local_now := now() at time zone tz;
  day_start := date_trunc('day', local_now) at time zone tz;
  week_start := date_trunc('week', local_now) at time zone tz;
  select * into streak from private.streaks(me);

  select jsonb_build_object(
    'time_zone', tz,
    'today', date_trunc('day', local_now)::date,
    'week_start', date_trunc('week', local_now)::date,
    'points_total', coalesce(sum(p.points), 0),
    -- Discovery Score input: discoveries only (no missions, saves, shares, bonuses).
    'discovery_points_total', coalesce(sum(p.points) filter (where p.kind in (
      'new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')), 0),
    'points_today', coalesce(sum(p.points) filter (where p.created_at >= day_start), 0),
    'points_week', coalesce(sum(p.points) filter (where p.created_at >= week_start), 0),
    'songs_total', count(*) filter (where p.kind = 'new_song'),
    'today_songs', count(*) filter (where p.kind = 'new_song' and p.created_at >= day_start),
    'today_artists', count(*) filter (where p.kind = 'new_artist' and p.created_at >= day_start),
    'week_songs', count(*) filter (where p.kind = 'new_song' and p.created_at >= week_start),
    'week_artists', count(*) filter (where p.kind = 'new_artist' and p.created_at >= week_start),
    'week_genres', count(*) filter (where p.kind = 'new_genre' and p.created_at >= week_start),
    'avg_daily_songs', round((count(*) filter (where p.kind = 'new_song' and p.created_at >= day_start - interval '14 days' and p.created_at < day_start))::numeric / 14, 2),
    'avg_daily_artists', round((count(*) filter (where p.kind = 'new_artist' and p.created_at >= day_start - interval '14 days' and p.created_at < day_start))::numeric / 14, 2),
    'avg_weekly_artists', round((count(*) filter (where p.kind = 'new_artist' and p.created_at >= week_start - interval '28 days' and p.created_at < week_start))::numeric / 4, 2),
    'current_streak', streak.current_streak,
    'longest_streak', streak.longest_streak
  ) into result
  from public.discovery_points p
  where p.user_id = me;

  -- Countries heard this week (not only new ones: "music from 5 countries this week").
  result := result || jsonb_build_object(
    'week_countries', (
      select count(distinct a.country_code) from public.listening_events e
      join public.artists a on a.id = e.artist_id
      where e.user_id = me and e.started_at >= week_start and e.ms_played >= 15000 and a.country_code is not null),
    'avg_weekly_countries', (
      select round(count(distinct (date_trunc('week', e.started_at at time zone tz), a.country_code))::numeric / 4, 2)
      from public.listening_events e join public.artists a on a.id = e.artist_id
      where e.user_id = me and e.started_at >= week_start - interval '28 days' and e.started_at < week_start
        and e.ms_played >= 15000 and a.country_code is not null),
    'genre_spread', coalesce((
      select jsonb_agg(n order by n desc) from (
        select count(*)::integer as n
        from public.discovery_points p join public.tracks t on t.id = p.track_id
        join public.release_genres g on g.release_id = t.release_id
        where p.user_id = me and p.kind = 'new_song' and p.created_at > now() - interval '90 days'
        group by g.genre_id
      ) spread), '[]'::jsonb)
  );
  return result;
end;
$$;


-- ---------------------------------------------------------------------------
-- Daily listening aggregates (listener's local days)
-- ---------------------------------------------------------------------------
create table public.listening_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  ms_played bigint not null default 0,
  -- Plays that count (≥ 30 s or finished, never soundchecks/previews).
  plays integer not null default 0,
  tracks integer not null default 0,
  artists integer not null default 0,
  -- Plays per local hour 0–23.
  hours integer[] not null default array_fill(0, array[24]),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.listening_daily enable row level security;
revoke all on public.listening_daily from anon, authenticated;
grant select on public.listening_daily to authenticated;
create policy listening_daily_own on public.listening_daily for select to authenticated
  using (user_id = (select auth.uid()));

create table private.listening_daily_state (
  id boolean primary key default true constraint listening_daily_state_single check (id),
  processed_until timestamptz not null default '-infinity'
);
insert into private.listening_daily_state default values;

/**
 * Recomputes the (listener, day) rows touched by listening recorded since the last run, and
 * drops rows past the 25-month retention. Returns the rows written.
 */
create function private.refresh_listening_daily()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  upto timestamptz := now();
  written integer;
begin
  select s.processed_until into since from private.listening_daily_state s for update;

  with touched as (
    select distinct e.user_id, (e.started_at at time zone private.listener_tz(e.user_id))::date as day
    from public.listening_events e
    where e.created_at > since and e.created_at <= upto
  ), bounds as (
    select t.user_id, t.day, private.listener_tz(t.user_id) as tz from touched t
  ), events as (
    select b.user_id, b.day, b.tz, e.track_id, e.artist_id, e.ms_played, e.started_at,
      (e.ms_played >= 30000 or e.completed) as counts
    from bounds b
    join public.listening_events e on e.user_id = b.user_id
      and e.started_at >= (b.day::timestamp at time zone b.tz)
      and e.started_at < ((b.day + 1)::timestamp at time zone b.tz)
      and not e.soundcheck
  ), totals as (
    select b.user_id, b.day,
      coalesce(sum(ev.ms_played), 0) as ms_played,
      count(*) filter (where ev.counts) as plays,
      count(distinct ev.track_id) filter (where ev.counts) as tracks,
      count(distinct ev.artist_id) filter (where ev.counts) as artists,
      array(
        select count(*) filter (where ev2.counts)::integer
        from generate_series(0, 23) h
        left join events ev2 on ev2.user_id = b.user_id and ev2.day = b.day
          and extract(hour from ev2.started_at at time zone b.tz) = h
        group by h order by h
      ) as hours
    from bounds b
    left join events ev on ev.user_id = b.user_id and ev.day = b.day
    group by b.user_id, b.day, b.tz
  )
  insert into public.listening_daily as d (user_id, day, ms_played, plays, tracks, artists, hours, updated_at)
  select t.user_id, t.day, t.ms_played, t.plays, t.tracks, t.artists, t.hours, now() from totals t
  on conflict (user_id, day) do update
    set ms_played = excluded.ms_played, plays = excluded.plays, tracks = excluded.tracks,
      artists = excluded.artists, hours = excluded.hours, updated_at = now();
  get diagnostics written = row_count;

  update private.listening_daily_state set processed_until = upto;
  delete from public.listening_daily d where d.day < (now() - interval '25 months')::date;
  return written;
end;
$$;

revoke execute on function private.refresh_listening_daily() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privacy switches
-- ---------------------------------------------------------------------------
alter table public.profile_settings
  add column profile_public boolean not null default true,
  add column stats_visibility public.visibility_level not null default 'followers',
  add column score_visibility public.visibility_level not null default 'public',
  add column badges_visibility public.visibility_level not null default 'public',
  add column replay_visibility public.visibility_level not null default 'followers';

grant update (profile_public, stats_visibility, score_visibility, badges_visibility, replay_visibility)
  on public.profile_settings to authenticated;

/**
 * Whether the caller may see `owner`'s data behind `level`: themselves always; nobody across a
 * block; nobody when the profile is private; else public / followers (people the owner is
 * followed by) / private.
 */
create function private.can_view(owner uuid, level public.visibility_level)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) = owner then true
    when (select auth.uid()) is not null and private.is_blocked_between((select auth.uid()), owner) then false
    when not coalesce((select s.profile_public from public.profile_settings s where s.user_id = owner), true) then false
    when level = 'public' then true
    when level = 'followers' then exists (
      select 1 from public.user_follows f
      where f.follower_id = (select auth.uid()) and f.followee_id = owner)
    else false
  end;
$$;

revoke execute on function private.can_view(uuid, public.visibility_level) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('listening-daily', '*/10 * * * *', 'select private.refresh_listening_daily()');
  end if;
end;
$$;
