-- M14.5 Statistics and music profile (docs/discovery-v2.md M14.5).
--
-- One function computes a listener's statistics for any period of their local days (at most
-- 400): totals and per-day/hour/weekday shapes from listening_daily (precomputed), tops and
-- sessions from their own listening history (indexed by listener and time), discoveries from the
-- ledger. Monthly recaps and Replay cache its result (M14.6, M14.7); pages for a week or a month
-- call it directly.

create function private.listening_stats(listener uuid, starts date, ends date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text := private.listener_tz(listener);
  t0 timestamptz;
  t1 timestamptz;
  result jsonb;
begin
  if ends <= starts or ends - starts > 400 then
    raise exception 'period must be 1 to 400 days' using errcode = '22023';
  end if;
  t0 := starts::timestamp at time zone tz;
  t1 := ends::timestamp at time zone tz;

  with days as (
    select d.* from public.listening_daily d
    where d.user_id = listener and d.day >= starts and d.day < ends
  ), plays as (
    select e.track_id, e.release_id, e.artist_id, e.started_at, e.ms_played,
      e.started_at + make_interval(secs => e.ms_played / 1000.0) as ended_at
    from public.listening_events e
    where e.user_id = listener and e.started_at >= t0 and e.started_at < t1
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  ), every_listen as (
    select e.started_at, e.started_at + make_interval(secs => e.ms_played / 1000.0) as ended_at
    from public.listening_events e
    where e.user_id = listener and e.started_at >= t0 and e.started_at < t1 and not e.soundcheck
  ), sessions as (
    -- A session ends after 30 minutes without listening.
    select min(started_at) as began, max(ended_at) as finished
    from (
      select l.*, sum(case when l.started_at > prev_end + interval '30 minutes' then 1 else 0 end)
        over (order by l.started_at) as n
      from (
        select x.*, max(x.ended_at) over (order by x.started_at rows between unbounded preceding and 1 preceding) as prev_end
        from every_listen x
      ) l
    ) s
    group by n
  ), dp as (
    select p.* from public.discovery_points p
    where p.user_id = listener and p.created_at >= t0 and p.created_at < t1
  ), discovery_days as (
    select distinct (p.created_at at time zone tz)::date as d from dp p where p.kind = 'new_song'
  ), runs as (
    select count(*) as length from (
      select d, d - (row_number() over (order by d))::integer as island from discovery_days
    ) x group by island
  ), hours as (
    select h, coalesce(sum(d.hours[h + 1]), 0)::integer as plays
    from generate_series(0, 23) h left join days d on true
    group by h
  ), weekdays as (
    select w, coalesce(sum(d.ms_played) filter (where extract(isodow from d.day) = w), 0)::bigint as ms
    from generate_series(1, 7) w left join days d on true
    group by w
  )
  select jsonb_build_object(
    'starts', starts,
    'ends', ends,
    'listening_ms', coalesce((select sum(ms_played) from days), 0),
    'plays', coalesce((select sum(d.plays) from days d), 0),
    'active_days', (select count(*) from days d where d.plays > 0),
    'tracks', (select count(distinct track_id) from plays),
    'artists', (select count(distinct artist_id) from plays),
    'albums', (select count(distinct release_id) from plays),
    'genres', (select count(distinct rg.genre_id) from plays p join public.release_genres rg on rg.release_id = p.release_id),
    'countries', (select count(distinct a.country_code) from plays p join public.artists a on a.id = p.artist_id where a.country_code is not null),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'ms', d.ms_played) order by d.day) from days d), '[]'::jsonb),
    'hours', (select jsonb_agg(plays order by h) from hours),
    'weekdays', (select jsonb_agg(ms order by w) from weekdays),
    'night_plays', coalesce((select sum(plays) from hours where h >= 22 or h < 5), 0),
    'top_day', (select jsonb_build_object('day', d.day, 'ms', d.ms_played) from days d order by d.ms_played desc, d.day limit 1),
    'longest_session_ms', coalesce((select (extract(epoch from max(finished - began)) * 1000)::bigint from sessions), 0),
    'longest_streak', coalesce((select max(length) from runs), 0),
    'top_artists', coalesce((
      select jsonb_agg(x order by x_plays desc, x_ms desc) from (
        select jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'country', a.country_code,
          'image_id', a.image_id, 'plays', count(*), 'ms', sum(p.ms_played)) as x,
          count(*) as x_plays, sum(p.ms_played) as x_ms
        from plays p join public.artists a on a.id = p.artist_id
        group by a.id order by count(*) desc, sum(p.ms_played) desc limit 5) t), '[]'::jsonb),
    'top_tracks', coalesce((
      select jsonb_agg(x order by x_plays desc, x_ms desc) from (
        select jsonb_build_object('id', t.id, 'title', t.title, 'code', t.public_code, 'artist', a.name,
          'artist_slug', a.slug, 'artwork_image_id', r.artwork_image_id, 'plays', count(*), 'ms', sum(p.ms_played)) as x,
          count(*) as x_plays, sum(p.ms_played) as x_ms
        from plays p join public.tracks t on t.id = p.track_id join public.releases r on r.id = t.release_id
        join public.artists a on a.id = p.artist_id
        group by t.id, a.id, r.id order by count(*) desc, sum(p.ms_played) desc limit 5) t), '[]'::jsonb),
    'top_albums', coalesce((
      select jsonb_agg(x order by x_plays desc) from (
        select jsonb_build_object('id', r.id, 'title', r.title, 'slug', r.slug, 'artist', a.name, 'artist_slug', a.slug,
          'artwork_image_id', r.artwork_image_id, 'plays', count(*)) as x, count(*) as x_plays
        from plays p join public.releases r on r.id = p.release_id join public.artists a on a.id = r.artist_id
        group by r.id, a.id order by count(*) desc limit 3) t), '[]'::jsonb),
    'top_genres', coalesce((
      select jsonb_agg(x order by n desc) from (
        select jsonb_build_object('slug', g.slug, 'name_pl', g.name_pl, 'name_en', g.name_en, 'plays', count(*)) as x, count(*) as n
        from plays p join public.release_genres rg on rg.release_id = p.release_id join public.genres g on g.id = rg.genre_id
        group by g.id order by count(*) desc limit 5) t), '[]'::jsonb),
    'top_countries', coalesce((
      select jsonb_agg(x order by n desc) from (
        select jsonb_build_object('code', a.country_code, 'plays', count(*)) as x, count(*) as n
        from plays p join public.artists a on a.id = p.artist_id where a.country_code is not null
        group by a.country_code order by count(*) desc limit 5) t), '[]'::jsonb),
    'new_songs', (select count(*) from dp where kind = 'new_song'),
    'new_artists', (select count(*) from dp where kind = 'new_artist'),
    'new_genres', (select count(*) from dp where kind = 'new_genre'),
    'new_countries', (select count(*) from dp where kind = 'new_country'),
    'underground', (select count(*) from dp where kind = 'underground'),
    'xp', coalesce((select sum(points) from dp), 0),
    'discovery_xp', coalesce((select sum(points) from dp where kind in (
      'new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')), 0),
    'achievements', (select count(*) from public.user_achievements u
      where u.user_id = listener and u.unlocked_at >= t0 and u.unlocked_at < t1),
    -- The artist first found in this period that was listened to most.
    'biggest_discovery', (
      select jsonb_build_object('id', a.id, 'slug', a.slug, 'name', a.name, 'country', a.country_code,
        'image_id', a.image_id, 'ms', sum(p.ms_played), 'plays', count(*))
      from dp join public.artists a on a.id = dp.artist_id
      join plays p on p.artist_id = a.id
      where dp.kind = 'new_artist'
      group by a.id order by sum(p.ms_played) desc limit 1),
    'top_discovered_genre', (
      select jsonb_build_object('slug', g.slug, 'name_pl', g.name_pl, 'name_en', g.name_en, 'songs', count(*))
      from dp join public.tracks t on t.id = dp.track_id
      join public.release_genres rg on rg.release_id = t.release_id join public.genres g on g.id = rg.genre_id
      where dp.kind = 'new_song'
      group by g.id order by count(*) desc limit 1),
    'genre_spread', coalesce((
      select jsonb_agg(n order by n desc) from (
        select count(*)::integer as n from dp join public.tracks t on t.id = dp.track_id
        join public.release_genres rg on rg.release_id = t.release_id
        where dp.kind = 'new_song' group by rg.genre_id) s), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke execute on function private.listening_stats(uuid, date, date) from public, anon, authenticated;

/** The caller's statistics for their local days [starts, ends). */
create function public.my_listening_stats(starts date, ends date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return private.listening_stats((select auth.uid()), starts, ends);
end;
$$;

revoke execute on function public.my_listening_stats(date, date) from public, anon;
grant execute on function public.my_listening_stats(date, date) to authenticated;

/** The caller's local "today" (their time zone), for choosing periods. */
create function public.my_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone private.listener_tz((select auth.uid())))::date;
$$;

revoke execute on function public.my_today() from public, anon;
grant execute on function public.my_today() to authenticated;
