-- M14.9 Artist discovery statistics (docs/discovery-v2.md M14.9).
--
-- Aggregates only. A country or city appears only with at least 3 listeners, and listener counts
-- below 3 are shown as "fewer than 3" (null), so no single listener can be singled out. The public
-- artist page and the team's dashboard read the same numbers; the team additionally sees weekly
-- series for the last 12 weeks.

/** Who listens to the artist (last 30 days): countries and cities with at least 3 listeners. */
create function private.artist_listener_places(artist uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with listeners as (
    select distinct e.user_id from public.listening_events e
    where e.artist_id = artist and e.started_at > now() - interval '30 days'
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  ), places as (
    select lp.country_code, nullif(lower(btrim(lp.city)), '') as city
    from listeners l join public.listener_preferences lp on lp.user_id = l.user_id
  )
  select jsonb_build_object(
    'countries', coalesce((select jsonb_agg(jsonb_build_object('code', country_code, 'listeners', n) order by n desc)
      from (select country_code, count(*)::integer as n from places where country_code is not null
            group by country_code having count(*) >= 3 order by count(*) desc limit 10) c), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('city', initcap(city), 'country', country_code, 'listeners', n) order by n desc)
      from (select city, max(country_code) as country_code, count(*)::integer as n from places where city is not null
            group by city having count(*) >= 3 order by count(*) desc limit 10) c), '[]'::jsonb)
  );
$$;

revoke execute on function private.artist_listener_places(uuid) from public, anon, authenticated;

/**
 * An artist's discovery side, for everyone: listeners this week / month and growth, how many people
 * discovered them in 30 days, the XP those discoveries earned (the artist's Discovery Score), the
 * place in the Rising chart, and where listeners are. Counts under 3 come back as null.
 */
create function public.artist_discovery(artist uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select x.id from public.artists x where x.id = artist_discovery.artist and x.status = 'active'
  ), c as (
    select ch.* from private.artist_charts ch join a on a.id = ch.artist_id
  ), rising as (
    select r.artist_id, (rank() over (order by r.listeners_7d - r.listeners_prev_7d desc, r.listeners_7d desc))::integer as place
    from private.artist_charts r
    where r.listeners_7d >= 3 and r.listeners_7d > r.listeners_prev_7d
  ), found as (
    select count(*) filter (where d.kind = 'new_artist')::integer as discovered_30d,
      coalesce(sum(d.points), 0)::integer as score_30d
    from public.discovery_points d join a on a.id = d.artist_id
    where d.created_at > now() - interval '30 days'
  )
  select case when not exists (select 1 from a) then null else jsonb_build_object(
    'listeners_7d', (select listeners_7d from c where listeners_7d >= 3),
    'listeners_prev_7d', (select listeners_prev_7d from c where listeners_7d >= 3 and listeners_prev_7d >= 3),
    'listeners_30d', (select listeners_30d from c where listeners_30d >= 3),
    'new_listeners_7d', (select new_listeners_7d from c where new_listeners_7d >= 3),
    'discovered_30d', (select case when discovered_30d >= 3 then discovered_30d end from found),
    'score_30d', (select case when discovered_30d >= 3 then score_30d end from found),
    'rising_place', (select r.place from rising r join a on a.id = r.artist_id where r.place <= 50),
    'places', private.artist_listener_places(artist)
  ) end;
$$;

revoke execute on function public.artist_discovery(uuid) from public;
grant execute on function public.artist_discovery(uuid) to anon, authenticated;

/** The team's weekly series (last 12 weeks): new listeners and discoveries per ISO week. */
create function public.artist_discovery_weeks(artist uuid)
returns table (week date, new_listeners integer, discoveries integer, listeners integer)
language sql
stable
security definer
set search_path = ''
as $$
  with weeks as (
    select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week')::date as week
  ), plays as (
    select e.user_id, e.started_at from public.listening_events e
    where e.artist_id = artist and e.started_at > date_trunc('week', now()) - interval '24 weeks'
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  ), firsts as (
    select user_id, date_trunc('week', min(started_at))::date as week from plays group by user_id
  )
  select w.week,
    (select count(*) from firsts f where f.week = w.week)::integer,
    (select count(*) from public.discovery_points d where d.artist_id = artist and d.kind = 'new_artist'
       and d.created_at >= w.week and d.created_at < w.week + 7)::integer,
    (select count(distinct p.user_id) from plays p where p.started_at >= w.week and p.started_at < w.week + 7)::integer
  from weeks w
  where public.is_artist_member(artist)
  order by w.week;
$$;

revoke execute on function public.artist_discovery_weeks(uuid) from public, anon;
grant execute on function public.artist_discovery_weeks(uuid) to authenticated;

/**
 * Why the signed-in listener might like an artist, from their own listening only: genres they play
 * that the artist releases in, related artists they listen to, and people they follow who
 * discovered the artist (as far as those people allow).
 */
create function public.why_artist_for_me(artist uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  my_plays as (
    select e.artist_id, e.release_id from public.listening_events e, me
    where e.user_id = me.id and e.started_at > now() - interval '180 days'
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  ), my_genres as (
    select rg.genre_id, count(*) as n from my_plays p join public.release_genres rg on rg.release_id = p.release_id
    group by rg.genre_id
  ), artist_genres as (
    select distinct rg.genre_id from public.releases r join public.release_genres rg on rg.release_id = r.id
    where r.artist_id = why_artist_for_me.artist and r.status = 'published'
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'listened', exists (select 1 from my_plays where artist_id = why_artist_for_me.artist),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name_pl', g.name_pl, 'name_en', g.name_en) order by mg.n desc)
      from my_genres mg join artist_genres ag on ag.genre_id = mg.genre_id join public.genres g on g.id = mg.genre_id), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(jsonb_build_object('slug', ra.slug, 'name', ra.name))
      from public.related_artists(why_artist_for_me.artist, 20) ra
      where exists (select 1 from my_plays p where p.artist_id = ra.artist_id)), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('handle', pr.handle, 'name', coalesce(pr.display_name, '@' || pr.handle)))
      from public.user_follows f
      join public.discovery_points d on d.user_id = f.followee_id and d.kind = 'new_artist' and d.artist_id = why_artist_for_me.artist
      join public.profiles pr on pr.id = f.followee_id and pr.deleted_at is null and pr.handle is not null
      left join public.profile_settings s on s.user_id = f.followee_id
      where f.follower_id = (select id from me)
        and private.can_view(f.followee_id, coalesce(s.stats_visibility, 'followers'))), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.why_artist_for_me(uuid) from public, anon;
grant execute on function public.why_artist_for_me(uuid) to authenticated;
