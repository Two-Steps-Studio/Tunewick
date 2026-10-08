-- M14.2 Charts & global discovery (docs/discovery-v2.md §2 V3, V4).
--
-- Charts count listeners, never plays: a listen counts at ≥ 30 s (or finished), previews never,
-- over the last 7 days (rising compares with the 7 days before). Three materialized views,
-- refreshed every 15 minutes, hold the numbers; the chart functions only filter and sort them.
--
-- Places: "Popular in <country/region>" counts listeners whose discovery country is there, and a
-- place shows a track only with at least 3 such listeners (no inference about single people).
-- Every other scope means the music's origin: country/region of the artist, the city scene
-- (artists from that city), a genre.

-- ---------------------------------------------------------------------------
-- Cached aggregates
-- ---------------------------------------------------------------------------
create materialized view private.track_charts as
with plays as (
  select e.track_id, e.user_id, e.started_at > now() - interval '7 days' as recent
  from public.listening_events e
  where e.started_at > now() - interval '14 days' and (e.ms_played >= 30000 or e.completed)
    and not e.soundcheck
), listens as (
  select p.track_id,
    count(distinct p.user_id) filter (where p.recent) as listeners_7d,
    count(distinct p.user_id) filter (where not p.recent) as listeners_prev_7d
  from plays p group by p.track_id
), discoveries as (
  select d.track_id, count(*) as discoveries_7d from public.discovery_points d
  where d.kind = 'new_song' and d.created_at > now() - interval '7 days' and d.track_id is not null
  group by d.track_id
), saves as (
  select s.track_id, count(*) as saves_7d from public.track_saves s
  where s.created_at > now() - interval '7 days' group by s.track_id
), shares as (
  select pe.track_id, count(*) as shares_7d from private.product_events pe
  where pe.name = 'share_clicked' and pe.created_at > now() - interval '7 days' and pe.track_id is not null
  group by pe.track_id
), active as (
  select track_id from listens union select track_id from discoveries
  union select track_id from saves union select track_id from shares
)
select t.id as track_id, r.id as release_id, r.artist_id,
  coalesce(l.listeners_7d, 0)::integer as listeners_7d,
  coalesce(l.listeners_prev_7d, 0)::integer as listeners_prev_7d,
  coalesce(d.discoveries_7d, 0)::integer as discoveries_7d,
  coalesce(s.saves_7d, 0)::integer as saves_7d,
  coalesce(sh.shares_7d, 0)::integer as shares_7d
from active a
join public.tracks t on t.id = a.track_id
join public.releases r on r.id = t.release_id
left join listens l on l.track_id = t.id
left join discoveries d on d.track_id = t.id
left join saves s on s.track_id = t.id
left join shares sh on sh.track_id = t.id
where public.release_is_public(r.id);

create unique index track_charts_pk on private.track_charts (track_id);

create materialized view private.track_chart_places as
select e.track_id, lp.country_code, count(distinct e.user_id)::integer as listeners_7d
from public.listening_events e
join public.listener_preferences lp on lp.user_id = e.user_id and lp.country_code is not null
where e.started_at > now() - interval '7 days' and (e.ms_played >= 30000 or e.completed) and not e.soundcheck
group by e.track_id, lp.country_code
having count(distinct e.user_id) >= 3;

create unique index track_chart_places_pk on private.track_chart_places (track_id, country_code);

create materialized view private.artist_charts as
with plays as (
  select e.artist_id, e.user_id, e.started_at
  from public.listening_events e
  where e.started_at > now() - interval '90 days' and (e.ms_played >= 30000 or e.completed)
    and not e.soundcheck
), per_listener as (
  select p.artist_id, p.user_id, min(p.started_at) as first_seen, max(p.started_at) as last_seen,
    bool_or(p.started_at <= now() - interval '7 days' and p.started_at > now() - interval '14 days') as prev_week
  from plays p group by p.artist_id, p.user_id
), discoveries as (
  select d.artist_id, count(*) as discoveries_7d from public.discovery_points d
  where d.kind = 'new_artist' and d.created_at > now() - interval '7 days' group by d.artist_id
)
select a.id as artist_id,
  (count(*) filter (where pl.last_seen > now() - interval '7 days'))::integer as listeners_7d,
  (count(*) filter (where pl.prev_week))::integer as listeners_prev_7d,
  (count(*) filter (where pl.last_seen > now() - interval '30 days'))::integer as listeners_30d,
  -- First heard (within 90 days) this week.
  (count(*) filter (where pl.first_seen > now() - interval '7 days'))::integer as new_listeners_7d,
  coalesce(max(d.discoveries_7d), 0)::integer as discoveries_7d
from public.artists a
join per_listener pl on pl.artist_id = a.id
left join discoveries d on d.artist_id = a.id
where a.status = 'active'
group by a.id;

create unique index artist_charts_pk on private.artist_charts (artist_id);

/** Refreshes the chart caches without blocking readers. Run every 15 minutes (pg_cron). */
create function private.refresh_charts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently private.track_charts;
  refresh materialized view concurrently private.track_chart_places;
  refresh materialized view concurrently private.artist_charts;
end;
$$;

revoke execute on function private.refresh_charts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Charts
-- ---------------------------------------------------------------------------

/**
 * A track chart. chart: top | rising | underground | discovered | saved | shared.
 * scope: global | country (code = ISO) | region (code = macro region) | city (code = city,
 * country = ISO) | genre (code = genre slug). For chart 'top', country/region mean listeners
 * there ("Popular in …"); otherwise the music's origin. growth: % vs the previous 7 days.
 */
create function public.music_chart(
  chart text default 'top',
  scope text default 'global',
  code text default null,
  country text default null,
  max_results integer default 100
)
returns table (
  rank integer, track_id uuid, title text, public_code text, release_slug text, release_title text,
  artwork_image_id uuid, artist_id uuid, artist_slug text, artist_name text, artist_country text,
  artist_image_id uuid, value integer, growth integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select c.*,
      case when music_chart.chart = 'top' and music_chart.scope in ('country', 'region') then (
        select coalesce(sum(p.listeners_7d), 0)::integer from private.track_chart_places p
        left join public.countries pc on pc.code = p.country_code
        where p.track_id = c.track_id
          and ((music_chart.scope = 'country' and p.country_code = upper(music_chart.code))
            or (music_chart.scope = 'region' and pc.region = music_chart.code)))
      end as place_listeners
    from private.track_charts c
  ), scoped as (
    select b.*, a.slug::text as a_slug, a.name as a_name, a.country_code as a_country,
      a.image_id as a_image, ac.listeners_30d as artist_listeners_30d
    from base b
    join public.artists a on a.id = b.artist_id
    left join public.countries ac_c on ac_c.code = a.country_code
    left join private.artist_charts ac on ac.artist_id = a.id
    where case music_chart.scope
      when 'global' then true
      when 'country' then music_chart.chart = 'top' or a.country_code = upper(music_chart.code)
      when 'region' then music_chart.chart = 'top' or ac_c.region = music_chart.code
      when 'city' then lower(a.city) = lower(music_chart.code)
        and (music_chart.country is null or a.country_code = upper(music_chart.country))
      when 'genre' then exists (
        select 1 from public.genres g
        where g.slug = music_chart.code and (
          exists (select 1 from public.release_genres rg where rg.release_id = b.release_id and rg.genre_id = g.id)
          or exists (select 1 from public.artist_genres ag where ag.artist_id = a.id and ag.genre_id = g.id)))
      else false
    end
  ), valued as (
    select s.*,
      case music_chart.chart
        when 'top' then coalesce(s.place_listeners, s.listeners_7d)
        when 'rising' then s.listeners_7d - s.listeners_prev_7d
        when 'underground' then s.listeners_7d
        when 'discovered' then s.discoveries_7d
        when 'saved' then s.saves_7d
        when 'shared' then s.shares_7d
      end as v
    from scoped s
    where case music_chart.chart
      when 'rising' then s.listeners_7d >= 3 and s.listeners_7d > s.listeners_prev_7d
      when 'underground' then coalesce(s.artist_listeners_30d, 0) < 10000 and s.listeners_7d > 0
      else true
    end
  )
  select (row_number() over (order by v.v desc, v.listeners_7d desc, t.title))::integer,
    v.track_id, t.title, t.public_code, r.slug::text, r.title, r.artwork_image_id,
    v.artist_id, v.a_slug, v.a_name, v.a_country, v.a_image, v.v,
    case when v.listeners_prev_7d > 0
      then round(100.0 * (v.listeners_7d - v.listeners_prev_7d) / v.listeners_prev_7d)::integer end
  from valued v
  join public.tracks t on t.id = v.track_id
  join public.releases r on r.id = v.release_id
  where v.v > 0
    and music_chart.chart in ('top', 'rising', 'underground', 'discovered', 'saved', 'shared')
  order by 1
  limit least(greatest(max_results, 1), 100);
$$;

/**
 * An artist chart. chart: rising | underground | discovered | new_listeners.
 * scope: global | country (artist from) | region | genre.
 */
create function public.artist_chart(
  chart text default 'rising',
  scope text default 'global',
  code text default null,
  max_results integer default 50
)
returns table (
  rank integer, artist_id uuid, slug text, name text, country_code text, city text,
  image_id uuid, value integer, listeners_7d integer, growth integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select c.*, a.slug::text as a_slug, a.name, a.country_code, a.city, a.image_id,
      case artist_chart.chart
        when 'rising' then c.listeners_7d - c.listeners_prev_7d
        when 'underground' then c.listeners_7d
        when 'discovered' then c.discoveries_7d
        when 'new_listeners' then c.new_listeners_7d
      end as v
    from private.artist_charts c
    join public.artists a on a.id = c.artist_id
    left join public.countries pc on pc.code = a.country_code
    where case artist_chart.scope
        when 'global' then true
        when 'country' then a.country_code = upper(artist_chart.code)
        when 'region' then pc.region = artist_chart.code
        when 'genre' then exists (
          select 1 from public.artist_genres ag join public.genres g on g.id = ag.genre_id
          where ag.artist_id = a.id and g.slug = artist_chart.code)
        else false
      end
      and case artist_chart.chart
        when 'rising' then c.listeners_7d >= 3 and c.listeners_7d > c.listeners_prev_7d
        when 'underground' then c.listeners_30d < 10000
        else true
      end
  )
  select (row_number() over (order by s.v desc, s.listeners_7d desc, s.name))::integer,
    s.artist_id, s.a_slug, s.name, s.country_code, s.city, s.image_id, s.v, s.listeners_7d,
    case when s.listeners_prev_7d > 0
      then round(100.0 * (s.listeners_7d - s.listeners_prev_7d) / s.listeners_prev_7d)::integer end
  from scoped s
  where s.v > 0 and artist_chart.chart in ('rising', 'underground', 'discovered', 'new_listeners')
  order by 1
  limit least(greatest(max_results, 1), 100);
$$;

/** Fresh releases published in the last `hours` (24, 168 or 720), newest first. */
create function public.fresh_releases(
  hours integer default 168,
  country text default null,
  genre text default null,
  max_results integer default 48
)
returns table (
  release_id uuid, slug text, title text, type text, publish_at timestamptz, artwork_image_id uuid,
  artist_id uuid, artist_slug text, artist_name text, artist_country text, listeners_7d integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.slug::text, r.title, r.type::text, r.publish_at, r.artwork_image_id,
    a.id, a.slug::text, a.name, a.country_code,
    coalesce((select sum(c.listeners_7d) from private.track_charts c where c.release_id = r.id), 0)::integer
  from public.releases r
  join public.artists a on a.id = r.artist_id
  where public.release_is_public(r.id)
    and r.publish_at > now() - make_interval(hours => least(greatest(fresh_releases.hours, 1), 720))
    and (fresh_releases.country is null or a.country_code = upper(fresh_releases.country))
    and (fresh_releases.genre is null or exists (
      select 1 from public.release_genres rg join public.genres g on g.id = rg.genre_id
      where rg.release_id = r.id and g.slug = fresh_releases.genre))
  order by r.publish_at desc
  limit least(greatest(max_results, 1), 100);
$$;

/** Cities of a country that have public music (the city-scene picker). */
create function public.music_cities(country text)
returns table (city text, artists integer)
language sql
stable
security definer
set search_path = ''
as $$
  select min(a.city), count(distinct a.id)::integer
  from public.artists a
  where a.country_code = upper(music_cities.country) and a.city is not null and a.status = 'active'
    and exists (select 1 from public.releases r where r.artist_id = a.id and public.release_is_public(r.id))
  group by lower(a.city)
  order by 2 desc, 1
  limit 100;
$$;

/**
 * "Discover the world": the most listened track of each country's music this week, outside the
 * caller's own country (or all countries for visitors).
 */
create function public.world_tracks(exclude_country text default null, max_results integer default 24)
returns table (
  country_code text, track_id uuid, title text, public_code text, artist_slug text, artist_name text,
  artwork_image_id uuid, listeners_7d integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select x.country_code, x.track_id, x.title, x.public_code, x.artist_slug, x.artist_name,
    x.artwork_image_id, x.listeners_7d
  from (
    select distinct on (a.country_code) a.country_code, c.track_id, t.title, t.public_code,
      a.slug::text as artist_slug, a.name as artist_name, r.artwork_image_id, c.listeners_7d
    from private.track_charts c
    join public.tracks t on t.id = c.track_id
    join public.releases r on r.id = c.release_id
    join public.artists a on a.id = c.artist_id
    where a.country_code is not null
      and (world_tracks.exclude_country is null or a.country_code <> upper(world_tracks.exclude_country))
      and c.listeners_7d > 0
    order by a.country_code, c.listeners_7d desc, c.discoveries_7d desc
  ) x
  order by x.listeners_7d desc
  limit least(greatest(max_results, 1), 60);
$$;

revoke execute on function
  public.music_chart(text, text, text, text, integer),
  public.artist_chart(text, text, text, integer),
  public.fresh_releases(integer, text, text, integer),
  public.music_cities(text),
  public.world_tracks(text, integer)
from public;
grant execute on function
  public.music_chart(text, text, text, text, integer),
  public.artist_chart(text, text, text, integer),
  public.fresh_releases(integer, text, text, integer),
  public.music_cities(text),
  public.world_tracks(text, integer)
to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('charts', '*/15 * * * *', 'select private.refresh_charts()');
  end if;
end;
$$;
