-- Discovery progress and the Discover feed (X-DB3, X-DB4, docs/discovery-expansion.md §4–§6).
-- Progress functions read only the caller's rows (or return aggregates). Feed functions return
-- per-track features; scoring and mixing happen in @tunewick/shared/discovery so the ranking can
-- be tested, explained and replaced without a migration.

-- ---------------------------------------------------------------------------
-- Listening stats for a period: 'week' / 'month' (local, listener's time zone) or 'all'
-- ---------------------------------------------------------------------------
create function public.my_discovery_stats(period text default 'all')
returns table (
  listening_ms bigint,
  plays integer,
  unique_songs integer,
  unique_artists integer,
  unique_releases integer,
  unique_genres integer,
  countries integer,
  new_songs integer,
  new_artists integer,
  new_genres integer,
  new_countries integer,
  points integer,
  saves integer,
  follows integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id,
      case my_discovery_stats.period
        when 'week' then date_trunc('week', now() at time zone private.listener_tz((select auth.uid()))) at time zone private.listener_tz((select auth.uid()))
        when 'month' then date_trunc('month', now() at time zone private.listener_tz((select auth.uid()))) at time zone private.listener_tz((select auth.uid()))
      end as since
  ),
  ev as (
    select e.* from public.listening_events e, me
    where e.user_id = me.id and (me.since is null or e.started_at >= me.since)
  ),
  dp as (
    select p.* from public.discovery_points p, me
    where p.user_id = me.id and (me.since is null or p.created_at >= me.since)
  )
  select
    coalesce((select sum(ev.ms_played) from ev), 0)::bigint,
    (select count(*) from ev where ev.context = 'player' and (ev.ms_played >= 30000 or ev.completed))::integer,
    (select count(distinct ev.track_id) from ev)::integer,
    (select count(distinct ev.artist_id) from ev)::integer,
    (select count(distinct ev.release_id) from ev)::integer,
    (select count(distinct g.genre_id) from ev join public.release_genres g on g.release_id = ev.release_id)::integer,
    (select count(distinct a.country_code) from ev join public.artists a on a.id = ev.artist_id)::integer,
    (select count(*) from dp where dp.kind = 'new_song')::integer,
    (select count(*) from dp where dp.kind = 'new_artist')::integer,
    (select count(*) from dp where dp.kind = 'new_genre')::integer,
    (select count(*) from dp where dp.kind = 'new_country')::integer,
    coalesce((select sum(dp.points) from dp), 0)::integer,
    (select count(*) from public.track_saves s, me
      where s.user_id = me.id and (me.since is null or s.created_at >= me.since))::integer,
    (select count(*) from public.artist_follows f, me
      where f.user_id = me.id and (me.since is null or f.created_at >= me.since))::integer;
$$;

revoke execute on function public.my_discovery_stats(text) from public, anon;
grant execute on function public.my_discovery_stats(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Progress: points, today/this week (listener's time zone), streaks, averages for adaptive
-- goals, genre spread of recent discoveries (diversity).
-- ---------------------------------------------------------------------------
create function public.my_progress()
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

revoke execute on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- Personal records
-- ---------------------------------------------------------------------------
create function public.my_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  tz := private.listener_tz(me);
  return jsonb_build_object(
    'most_songs_day', (
      select jsonb_build_object('value', count(*), 'date', (p.created_at at time zone tz)::date)
      from public.discovery_points p where p.user_id = me and p.kind = 'new_song'
      group by (p.created_at at time zone tz)::date order by count(*) desc, min(p.created_at) limit 1),
    'most_artists_week', (
      select jsonb_build_object('value', count(*), 'date', date_trunc('week', p.created_at at time zone tz)::date)
      from public.discovery_points p where p.user_id = me and p.kind = 'new_artist'
      group by date_trunc('week', p.created_at at time zone tz) order by count(*) desc, min(p.created_at) limit 1),
    'longest_streak', (select s.longest_streak from private.streaks(me) s),
    'countries', (select count(*) from public.discovery_points p where p.user_id = me and p.kind = 'new_country'),
    -- A session is listening with gaps under 30 minutes; only listens of ≥ 15 s count.
    'longest_session', (
      with ev as (
        select e.started_at, e.ms_played,
          case when e.started_at - lag(e.started_at + make_interval(secs => e.ms_played / 1000.0))
            over (order by e.started_at) > interval '30 minutes' then 1 else 0 end as gap
        from public.listening_events e
        where e.user_id = me and e.ms_played >= 15000
      ), numbered as (
        select ev.*, sum(gap) over (order by started_at) as session from ev
      )
      select jsonb_build_object('value', sum(ms_played), 'date', (min(started_at) at time zone tz)::date)
      from numbered group by session order by sum(ms_played) desc limit 1)
  );
end;
$$;

revoke execute on function public.my_records() from public, anon;
grant execute on function public.my_records() to authenticated;

-- ---------------------------------------------------------------------------
-- Rankings: discovery points only (never listening time). UTC periods, so everyone competes in
-- the same week. Public rows only for listeners with a handle who did not opt out.
-- ---------------------------------------------------------------------------
create function private.period_bounds(period text, out starts timestamptz, out ends timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    case period
      when 'week' then date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
      when 'last_week' then (date_trunc('week', now() at time zone 'UTC') - interval '7 days') at time zone 'UTC'
      when 'month' then date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      else '-infinity'::timestamptz
    end,
    case period
      when 'last_week' then date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
      else 'infinity'::timestamptz
    end;
$$;

revoke execute on function private.period_bounds(text) from public, anon, authenticated;

create function private.period_scores(period text, country text, macro_region text)
returns table (user_id uuid, points integer, discoveries integer, rank integer)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (select * from private.period_bounds(period)),
  totals as (
    select p.user_id, sum(p.points)::integer as points,
      (count(*) filter (where p.kind = 'new_song'))::integer as discoveries
    from public.discovery_points p, bounds b
    where p.created_at >= b.starts and p.created_at < b.ends
    group by p.user_id
  )
  select t.user_id, t.points, t.discoveries,
    (rank() over (order by t.points desc, t.discoveries desc))::integer
  from totals t
  left join public.listener_preferences lp on lp.user_id = t.user_id
  left join public.countries c on c.code = lp.country_code
  where t.points > 0
    and (country is null or lp.country_code = country)
    and (macro_region is null or c.region = macro_region);
$$;

revoke execute on function private.period_scores(text, text, text) from public, anon, authenticated;

create function public.discovery_leaderboard(
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
    and period in ('week', 'last_week', 'month', 'all')
  order by s.rank, pr.handle
  limit least(greatest(max_results, 1), 100);
$$;

/** The caller's place (also when not listed publicly) and how many took part. */
create function public.my_ranking(period text default 'week', country text default null, macro_region text default null)
returns table (rank integer, points integer, participants integer, percentile integer, listed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with scores as (select * from private.period_scores(period, country, macro_region)),
  me as (select * from scores where scores.user_id = (select auth.uid()))
  select me.rank, me.points, (select count(*)::integer from scores),
    -- Share of participants with fewer points ("you discovered more than N % of listeners").
    (100 * (select count(*) from scores s where s.points < me.points) / greatest((select count(*) from scores), 1))::integer,
    exists (
      select 1 from public.profiles pr left join public.listener_preferences lp on lp.user_id = pr.id
      where pr.id = me.user_id and pr.handle is not null and pr.deleted_at is null and coalesce(lp.show_in_rankings, true))
  from me;
$$;

revoke execute on function public.discovery_leaderboard(text, text, text, integer) from public;
grant execute on function public.discovery_leaderboard(text, text, text, integer) to anon, authenticated;
revoke execute on function public.my_ranking(text, text, text) from public, anon;
grant execute on function public.my_ranking(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly recap (local weeks; 1 = the last complete week, 0 = this week so far)
-- ---------------------------------------------------------------------------
create function public.my_weekly_recap(weeks_ago integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tz text;
  starts timestamptz;
  ends timestamptz;
  result jsonb;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  tz := private.listener_tz(me);
  starts := (date_trunc('week', now() at time zone tz) - make_interval(days => 7 * greatest(least(weeks_ago, 52), 0))) at time zone tz;
  ends := starts + interval '7 days';

  with ev as (
    select e.* from public.listening_events e where e.user_id = me and e.started_at >= starts and e.started_at < ends
  ), dp as (
    select p.* from public.discovery_points p where p.user_id = me and p.created_at >= starts and p.created_at < ends
  ), mine as (
    select coalesce(sum(dp.points), 0) as points from dp
  ), week_scores as (
    select p.user_id, sum(p.points) as points from public.discovery_points p
    where p.created_at >= starts and p.created_at < ends group by p.user_id having sum(p.points) > 0
  )
  select jsonb_build_object(
    'week_start', (starts at time zone tz)::date,
    'listening_ms', coalesce((select sum(ms_played) from ev), 0),
    'songs', (select count(distinct track_id) from ev),
    'new_songs', (select count(*) from dp where kind = 'new_song'),
    'new_artists', (select count(*) from dp where kind = 'new_artist'),
    'countries', (select count(distinct a.country_code) from ev join public.artists a on a.id = ev.artist_id where a.country_code is not null),
    'genres', (select count(distinct g.genre_id) from ev join public.release_genres g on g.release_id = ev.release_id),
    'points', (select points from mine),
    'streak', (select s.current_streak from private.streaks(me) s),
    'biggest_discovery', (
      select jsonb_build_object('name', a.name, 'slug', a.slug::text, 'ms', sum(ev.ms_played))
      from ev join public.artists a on a.id = ev.artist_id
      where ev.artist_id in (select dp.artist_id from dp where dp.kind = 'new_artist')
      group by a.id order by sum(ev.ms_played) desc limit 1),
    'top_genre', (
      select jsonb_build_object('slug', gr.slug, 'name_pl', gr.name_pl, 'name_en', gr.name_en)
      from ev join public.release_genres g on g.release_id = ev.release_id join public.genres gr on gr.id = g.genre_id
      group by gr.id order by sum(ev.ms_played) desc limit 1),
    'percentile', case when (select points from mine) > 0 then (
      100 * (select count(*) from week_scores w where w.points < (select points from mine))
      / greatest((select count(*) from week_scores), 1)) end
  ) into result;
  return result;
end;
$$;

revoke execute on function public.my_weekly_recap(integer) from public, anon;
grant execute on function public.my_weekly_recap(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Feed: candidates with features (public, playable tracks only)
-- ---------------------------------------------------------------------------
create function public.discover_candidates(
  mode text default 'for_you',
  country text default null,
  hide_explicit boolean default false,
  max_results integer default 400
)
returns table (
  track_id uuid,
  public_code text,
  title text,
  duration_ms integer,
  explicit boolean,
  release_id uuid,
  release_slug text,
  release_title text,
  publish_at timestamptz,
  artwork_image_id uuid,
  artist_id uuid,
  artist_slug text,
  artist_name text,
  artist_image_id uuid,
  verified boolean,
  country_code text,
  macro_region text,
  city text,
  languages text[],
  genre_ids smallint[],
  followers integer,
  listeners_30d integer,
  listeners_7d integer,
  listeners_prev_7d integer,
  plays_30d integer,
  completion_rate real,
  replay_rate real,
  save_rate real,
  skip_rate real,
  country_listeners_30d integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with playable as (
    select t.id, t.public_code, t.title, t.duration_ms, (t.explicit or r.explicit) as explicit,
      r.id as release_id, r.slug::text as release_slug, r.title as release_title, r.publish_at,
      r.artwork_image_id, a.id as artist_id, a.slug::text as artist_slug, a.name as artist_name,
      a.image_id as artist_image_id, a.verification_status = 'verified' as verified,
      a.country_code, c.region as macro_region, a.city, a.languages
    from public.tracks t
    join public.releases r on r.id = t.release_id
    join public.artists a on a.id = r.artist_id
    left join public.countries c on c.code = a.country_code
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (not discover_candidates.hide_explicit or not (t.explicit or r.explicit))
      and exists (
        select 1 from public.track_audio_uploads u
        join public.track_audio_variants v on v.upload_id = u.id and v.codec = 'aac_lc'
        where u.track_id = t.id and u.status = 'accepted')
  ), listens as (
    select e.track_id,
      count(distinct e.user_id) filter (where e.started_at > now() - interval '30 days') as listeners_30d,
      count(distinct e.user_id) filter (where e.started_at > now() - interval '7 days') as listeners_7d,
      count(distinct e.user_id) filter (where e.started_at <= now() - interval '7 days' and e.started_at > now() - interval '14 days') as listeners_prev_7d,
      count(*) filter (where e.started_at > now() - interval '30 days') as plays_30d,
      avg(e.completed::integer) filter (where e.started_at > now() - interval '30 days') as completion_rate,
      count(distinct e.user_id) filter (where e.started_at > now() - interval '30 days' and lp.country_code = discover_candidates.country) as country_listeners_30d
    from public.listening_events e
    left join public.listener_preferences lp on lp.user_id = e.user_id
    where e.started_at > now() - interval '30 days' and e.ms_played >= 5000
    group by e.track_id
  ), skips as (
    select pe.track_id,
      count(*) filter (where pe.name = 'song_skipped') as skipped,
      count(*) filter (where pe.name = 'song_impression') as shown
    from private.product_events pe
    where pe.created_at > now() - interval '30 days' and pe.name in ('song_skipped', 'song_impression')
    group by pe.track_id
  )
  select p.id, p.public_code, p.title, p.duration_ms, p.explicit, p.release_id, p.release_slug, p.release_title,
    p.publish_at, p.artwork_image_id, p.artist_id, p.artist_slug, p.artist_name, p.artist_image_id, p.verified,
    p.country_code, p.macro_region, p.city, p.languages,
    coalesce(
      (select array_agg(g.genre_id order by g.genre_id) from public.release_genres g where g.release_id = p.release_id),
      (select array_agg(g.genre_id order by g.genre_id) from public.artist_genres g where g.artist_id = p.artist_id),
      '{}'),
    (select count(*)::integer from public.artist_follows f where f.artist_id = p.artist_id),
    coalesce(l.listeners_30d, 0)::integer,
    coalesce(l.listeners_7d, 0)::integer,
    coalesce(l.listeners_prev_7d, 0)::integer,
    coalesce(l.plays_30d, 0)::integer,
    coalesce(l.completion_rate, 0)::real,
    case when coalesce(l.listeners_30d, 0) > 0 then greatest(l.plays_30d - l.listeners_30d, 0)::real / l.plays_30d else 0 end,
    case when coalesce(l.listeners_30d, 0) > 0
      then least((select count(*) from public.track_saves s where s.track_id = p.id and s.created_at > now() - interval '30 days')::real / l.listeners_30d, 1)
      else 0 end,
    case when coalesce(k.shown, 0) > 0 then least(k.skipped::real / k.shown, 1) else 0 end,
    coalesce(l.country_listeners_30d, 0)::integer
  from playable p
  left join listens l on l.track_id = p.id
  left join skips k on k.track_id = p.id
  order by
    case when discover_candidates.mode = 'nearby' and p.country_code = discover_candidates.country then 0 else 1 end,
    case when discover_candidates.mode in ('new', 'nearby') then extract(epoch from p.publish_at) end desc nulls last,
    case when discover_candidates.mode = 'rising' then coalesce(l.listeners_7d, 0) - coalesce(l.listeners_prev_7d, 0) end desc nulls last,
    coalesce(l.listeners_30d, 0) desc,
    p.publish_at desc
  limit least(greatest(max_results, 1), 1000);
$$;

revoke execute on function public.discover_candidates(text, text, boolean, integer) from public;
grant execute on function public.discover_candidates(text, text, boolean, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The caller's taste: raw affinity signals (normalized in the app) + what to avoid repeating.
-- ---------------------------------------------------------------------------
/** Per-track taste signals of a listener (likes, saves, recent listens, skips). */
create function private.taste_signals(listener uuid)
returns table (track_id uuid, artist_id uuid, w numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select x.track_id, x.artist_id, sum(x.w) from (
    select l.track_id, r.artist_id, 3.0 as w from public.track_likes l
      join public.tracks t on t.id = l.track_id join public.releases r on r.id = t.release_id
      where l.user_id = listener
    union all
    select s.track_id, r.artist_id, 3.0 from public.track_saves s
      join public.tracks t on t.id = s.track_id join public.releases r on r.id = t.release_id
      where s.user_id = listener
    union all
    select e.track_id, e.artist_id,
      case when e.completed then 1.5 when e.ms_played >= 30000 then 1.0 when e.ms_played >= 15000 then 0.5 else -0.5 end
    from public.listening_events e
    where e.user_id = listener and e.started_at > now() - interval '90 days'
    union all
    select pe.track_id, pe.artist_id, -1.0 from private.product_events pe
    where pe.user_id = listener and pe.name = 'song_skipped' and pe.created_at > now() - interval '60 days'
      and pe.track_id is not null and pe.artist_id is not null
  ) x
  group by x.track_id, x.artist_id;
$$;

revoke execute on function private.taste_signals(uuid) from public, anon, authenticated;

create function public.my_taste()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'preferences', (
      select to_jsonb(lp) - 'user_id' - 'created_at' - 'updated_at'
      from public.listener_preferences lp where lp.user_id = me),
    -- Affinities from likes and saves (+3), listens (+0.5 … +1.5, short ones −0.5), skips (−1),
    -- follows (+5 per artist) and onboarding genres (+3), summed per artist, genre and country.
    'artists', coalesce((select jsonb_agg(jsonb_build_object('id', a.artist_id, 'w', a.w)) from (
        select artist_id, sum(w) as w from (
          select s.artist_id, s.w from private.taste_signals(me) s
          union all
          select f.artist_id, 5.0 from public.artist_follows f where f.user_id = me
        ) x group by artist_id order by abs(sum(w)) desc limit 300) a), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('id', g.genre_id, 'w', g.w)) from (
        select genre_id, sum(w) as w from (
          select coalesce(rg.genre_id, ag.genre_id) as genre_id, s.w
          from private.taste_signals(me) s
          join public.tracks t on t.id = s.track_id
          left join public.release_genres rg on rg.release_id = t.release_id
          left join public.artist_genres ag on rg.genre_id is null and ag.artist_id = s.artist_id
          union all
          select ag.genre_id, 2.0 from public.artist_follows f
          join public.artist_genres ag on ag.artist_id = f.artist_id where f.user_id = me
          union all
          select unnest(lp.genre_ids), 3.0 from public.listener_preferences lp where lp.user_id = me
        ) x where genre_id is not null group by genre_id) g), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('code', c.country_code, 'w', c.w)) from (
        select a.country_code, sum(s.w) as w from private.taste_signals(me) s
        join public.artists a on a.id = s.artist_id
        where a.country_code is not null group by a.country_code) c), '[]'::jsonb),
    'skipped', coalesce((
      select jsonb_agg(distinct pe.track_id) from private.product_events pe
      where pe.user_id = me and pe.name = 'song_skipped' and pe.created_at > now() - interval '30 days'
        and pe.track_id is not null), '[]'::jsonb),
    'followed_artists', coalesce((select jsonb_agg(f.artist_id) from public.artist_follows f where f.user_id = me), '[]'::jsonb),
    -- Artists followed by listeners who share at least one follow with the caller.
    'co_followed', coalesce((
      select jsonb_agg(jsonb_build_object('artist', c.artist_id, 'n', c.n))
      from (
        select f2.artist_id, count(distinct f2.user_id) as n
        from public.artist_follows mine
        join public.artist_follows f1 on f1.artist_id = mine.artist_id and f1.user_id <> me
        join public.artist_follows f2 on f2.user_id = f1.user_id
        where mine.user_id = me
          and not exists (select 1 from public.artist_follows x where x.user_id = me and x.artist_id = f2.artist_id)
        group by f2.artist_id
        order by count(distinct f2.user_id) desc
        limit 100
      ) c), '[]'::jsonb),
    -- Already discovered (heard ≥ 15 s) and shown recently.
    'heard', coalesce((
      select jsonb_agg(p.track_id) from public.discovery_points p
      where p.user_id = me and p.kind = 'new_song' and p.track_id is not null), '[]'::jsonb),
    'recently_shown', coalesce((
      select jsonb_agg(distinct pe.track_id) from private.product_events pe
      where pe.user_id = me and pe.name = 'song_impression' and pe.created_at > now() - interval '2 days'
        and pe.track_id is not null), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_taste() from public, anon;
grant execute on function public.my_taste() to authenticated;

-- ---------------------------------------------------------------------------
-- Previews: the window to play and the AAC variants to play it from (public tracks only).
-- ---------------------------------------------------------------------------
create function public.track_previews(tracks uuid[])
returns table (
  track_id uuid,
  duration_ms integer,
  preview_start_ms integer,
  preview_duration_ms integer,
  variants jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.duration_ms, t.soundcheck_start_ms, t.soundcheck_duration_ms,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier', v.tier, 'codec', v.codec, 'container', v.container, 'sample_rate', v.sample_rate,
        'bitrate_kbps', v.bitrate_kbps, 'nominal_kbps', v.nominal_kbps, 'samples', v.samples,
        'encoder_delay_samples', v.encoder_delay_samples, 'padding_samples', v.padding_samples,
        'object_key', v.object_key) order by v.tier)
      from public.track_audio_variants v where v.upload_id = u.id and v.codec = 'aac_lc'), '[]'::jsonb)
  from public.tracks t
  join lateral (
    select a.id from public.track_audio_uploads a
    where a.track_id = t.id and a.status = 'accepted'
    order by a.created_at desc limit 1
  ) u on true
  where t.id = any (track_previews.tracks[1:50])
    and public.release_is_public(t.release_id);
$$;

revoke execute on function public.track_previews(uuid[]) from public;
grant execute on function public.track_previews(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Artists: similar artists, top tracks, onboarding suggestions
-- ---------------------------------------------------------------------------
create function public.similar_artists(artist uuid, max_results integer default 8)
returns table (
  artist_id uuid,
  artist_slug text,
  name text,
  image_id uuid,
  country_code text,
  city text,
  shared_genres integer,
  shared_listeners integer,
  same_country boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select a.id, a.country_code,
      coalesce(
        (select array_agg(g.genre_id) from public.artist_genres g where g.artist_id = a.id),
        (select array_agg(distinct g.genre_id) from public.release_genres g
          join public.releases r on r.id = g.release_id
          where r.artist_id = a.id and r.status = 'published' and r.publish_at <= now()),
        '{}') as genres
    from public.artists a where a.id = similar_artists.artist and a.status = 'active'
  ), others as (
    select a.id, a.slug::text as slug, a.name, a.image_id, a.country_code, a.city,
      coalesce(
        (select array_agg(g.genre_id) from public.artist_genres g where g.artist_id = a.id),
        (select array_agg(distinct g.genre_id) from public.release_genres g
          join public.releases r on r.id = g.release_id
          where r.artist_id = a.id and r.status = 'published' and r.publish_at <= now()),
        '{}') as genres
    from public.artists a
    where a.status = 'active' and a.id <> similar_artists.artist
      and exists (select 1 from public.releases r where r.artist_id = a.id and r.status = 'published' and r.publish_at <= now())
  ), scored as (
    select o.*,
      (select count(*) from unnest(o.genres) g where g = any (b.genres))::integer as shared_genres,
      (select count(distinct f1.user_id) from public.artist_follows f1
        join public.artist_follows f2 on f2.user_id = f1.user_id and f2.artist_id = b.id
        where f1.artist_id = o.id)::integer as shared_listeners,
      coalesce(o.country_code = b.country_code, false) as same_country
    from others o, base b
  )
  select s.id, s.slug, s.name, s.image_id, s.country_code, s.city, s.shared_genres, s.shared_listeners, s.same_country
  from scored s
  where s.shared_genres > 0 or s.shared_listeners > 0
  order by 2 * s.shared_genres + s.shared_listeners + case when s.same_country then 1 else 0 end desc, s.name
  limit least(greatest(max_results, 1), 24);
$$;

revoke execute on function public.similar_artists(uuid, integer) from public;
grant execute on function public.similar_artists(uuid, integer) to anon, authenticated;

/** An artist's public tracks by listeners in the last 30 days (a real count), then newest. */
create function public.artist_top_tracks(artist uuid, max_results integer default 5)
returns table (track_id uuid, title text, public_code text, release_slug text, release_title text,
  artwork_image_id uuid, publish_at timestamptz, listeners_30d integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, t.public_code, r.slug::text, r.title, r.artwork_image_id, r.publish_at,
    (select count(distinct e.user_id) from public.listening_events e
      where e.track_id = t.id and e.started_at > now() - interval '30 days' and e.ms_played >= 15000)::integer
  from public.tracks t join public.releases r on r.id = t.release_id
  where r.artist_id = artist_top_tracks.artist and public.release_is_public(r.id)
  order by 8 desc, r.publish_at desc, t.track_number
  limit least(greatest(max_results, 1), 20);
$$;

revoke execute on function public.artist_top_tracks(uuid, integer) from public;
grant execute on function public.artist_top_tracks(uuid, integer) to anon, authenticated;

/** Artists to offer in onboarding: matching genres/country first, then most followed, then newest. */
create function public.onboarding_artists(genres smallint[] default '{}', country text default null, max_results integer default 12)
returns table (artist_id uuid, artist_slug text, name text, image_id uuid, country_code text, followers integer, matches integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug::text, a.name, a.image_id, a.country_code,
    (select count(*)::integer from public.artist_follows f where f.artist_id = a.id),
    ((select count(*) from public.artist_genres g where g.artist_id = a.id and g.genre_id = any (onboarding_artists.genres))
      + (select count(distinct g.genre_id) from public.release_genres g join public.releases r on r.id = g.release_id
          where r.artist_id = a.id and r.status = 'published' and g.genre_id = any (onboarding_artists.genres))
      + case when a.country_code = onboarding_artists.country then 1 else 0 end)::integer
  from public.artists a
  where a.status = 'active'
    and exists (select 1 from public.releases r where r.artist_id = a.id and r.status = 'published' and r.publish_at <= now())
  order by 7 desc, 6 desc, a.created_at desc
  limit least(greatest(max_results, 1), 30);
$$;

revoke execute on function public.onboarding_artists(smallint[], text, integer) from public;
grant execute on function public.onboarding_artists(smallint[], text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Browse (the former Discover home): new music filtered by country, and by voivodeship within
-- Poland. Same rules as before (newest first, one release per artist, true reasons).
-- ---------------------------------------------------------------------------
drop function public.discover_releases(public.voivodeship, integer);
drop function public.discover_artists(public.voivodeship, integer);

/** Newest public releases, at most one per artist (the artist's newest), newest first. */
create function public.discover_releases(
  region public.voivodeship default null,
  max_results integer default 12,
  country text default null
)
returns table (
  release_id uuid,
  release_slug text,
  title text,
  release_type public.release_type,
  publish_at timestamptz,
  artwork_image_id uuid,
  artist_name text,
  artist_slug text,
  city text,
  voivodeship public.voivodeship,
  is_debut boolean,
  country_code text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with public_releases as (
    select r.*, a.name as artist_name, a.slug as artist_slug, a.city, a.voivodeship, a.country_code,
      row_number() over (partition by r.artist_id order by r.publish_at desc) as newest,
      count(*) over (partition by r.artist_id) as release_count
    from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (discover_releases.region is null or a.voivodeship = discover_releases.region)
      and (discover_releases.country is null or a.country_code = discover_releases.country)
  )
  select p.id, p.slug::text, p.title, p.type, p.publish_at, p.artwork_image_id, p.artist_name,
    p.artist_slug::text, p.city, p.voivodeship, p.release_count = 1, p.country_code
  from public_releases p
  where p.newest = 1
  order by p.publish_at desc
  limit least(greatest(discover_releases.max_results, 1), 48);
$$;

/** Artists by their first public release (newest debuts first). */
create function public.discover_artists(
  region public.voivodeship default null,
  max_results integer default 12,
  country text default null
)
returns table (
  artist_id uuid,
  artist_slug text,
  name text,
  image_id uuid,
  city text,
  voivodeship public.voivodeship,
  verification_status public.artist_verification,
  first_release_at timestamptz,
  release_count integer,
  country_code text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.slug::text, a.name, a.image_id, a.city, a.voivodeship, a.verification_status,
    min(r.publish_at), count(r.id)::integer, a.country_code
  from public.artists a
  join public.releases r on r.artist_id = a.id and r.status = 'published' and r.publish_at <= now()
  where a.status = 'active'
    and (discover_artists.region is null or a.voivodeship = discover_artists.region)
    and (discover_artists.country is null or a.country_code = discover_artists.country)
  group by a.id
  order by min(r.publish_at) desc
  limit least(greatest(discover_artists.max_results, 1), 48);
$$;

/** Countries that have public music (for the Browse filter), with how many artists. */
create function public.browse_countries()
returns table (country_code text, artists integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.country_code, count(distinct a.id)::integer
  from public.artists a
  where a.status = 'active' and a.country_code is not null
    and exists (select 1 from public.releases r where r.artist_id = a.id and r.status = 'published' and r.publish_at <= now())
  group by a.country_code
  order by count(distinct a.id) desc, a.country_code;
$$;

grant execute on function public.discover_releases(public.voivodeship, integer, text) to anon, authenticated;
grant execute on function public.discover_artists(public.voivodeship, integer, text) to anon, authenticated;
grant execute on function public.browse_countries() to anon, authenticated;
