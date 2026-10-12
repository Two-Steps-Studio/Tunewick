-- M14.10 Music map / atlas (docs/discovery-v2.md M14.10): country → city → scene.
--
-- Built only from public catalogue facts (active artists with published releases, their country
-- and city, genres of published releases, published events at venues) and the chart caches
-- (listener counts are aggregates with the same 3-listener floor as the charts). The signed-in
-- listener additionally sees which countries they have discovered music from.

/** Artists that have something to listen to (an active profile with a published release). */
create function private.atlas_artists()
returns table (id uuid, slug text, name text, image_id uuid, country_code text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug::text, a.name, a.image_id, a.country_code, nullif(btrim(a.city), '')
  from public.artists a
  where a.status = 'active' and a.country_code is not null
    and exists (select 1 from public.releases r where r.artist_id = a.id and r.status = 'published');
$$;

revoke execute on function private.atlas_artists() from public, anon, authenticated;

/**
 * Every country with music on Tunewick: artists, listeners of its artists this week (3+), and
 * for a signed-in listener whether they have discovered music from it.
 */
create function public.atlas_countries()
returns table (country_code text, region text, artists integer, listeners_7d integer, discovered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select * from private.atlas_artists()),
  mine as (
    select distinct ar.country_code from public.listening_events e
    join public.artists ar on ar.id = e.artist_id
    where e.user_id = (select auth.uid()) and ar.country_code is not null
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  )
  select a.country_code, c.region, count(*)::integer,
    nullif(coalesce(sum(ch.listeners_7d) filter (where ch.listeners_7d >= 3), 0), 0)::integer,
    exists (select 1 from mine m where m.country_code = a.country_code)
  from a
  join public.countries c on c.code = a.country_code
  left join private.artist_charts ch on ch.artist_id = a.id
  group by a.country_code, c.region
  order by count(*) desc, a.country_code;
$$;

revoke execute on function public.atlas_countries() from public;
grant execute on function public.atlas_countries() to anon, authenticated;

/** A country: its cities, genres and the artists most listened to this month. */
create function public.atlas_country(code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select * from private.atlas_artists() x where x.country_code = upper(atlas_country.code))
  select case when not exists (select 1 from a) then null else jsonb_build_object(
    'artists', (select count(*) from a),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'artists', n) order by n desc, city)
      from (select initcap(lower(city)) as city, count(*)::integer as n from a where city is not null
            group by initcap(lower(city))) c), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name_pl', g.name_pl, 'name_en', g.name_en, 'artists', n) order by n desc)
      from (select rg.genre_id, count(distinct r.artist_id)::integer as n from a
            join public.releases r on r.artist_id = a.id and r.status = 'published'
            join public.release_genres rg on rg.release_id = r.id group by rg.genre_id order by 2 desc limit 12) x
      join public.genres g on g.id = x.genre_id), '[]'::jsonb),
    'top_artists', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'image_id', image_id,
        'city', city, 'listeners_30d', listeners) order by listeners desc nulls last, name)
      from (select a.slug, a.name, a.image_id, a.city,
              case when ch.listeners_30d >= 3 then ch.listeners_30d end as listeners
            from a left join private.artist_charts ch on ch.artist_id = a.id
            order by ch.listeners_30d desc nulls last, a.name limit 24) t), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.atlas_country(text) from public;
grant execute on function public.atlas_country(text) to anon, authenticated;

/** A city's scene: its artists, their genres, and (in Poland) venues with upcoming events. */
create function public.atlas_city(code text, city text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select * from private.atlas_artists() x
    where x.country_code = upper(atlas_city.code) and lower(x.city) = lower(btrim(atlas_city.city))
  ), v as (
    select ve.* from public.venues ve
    where upper(atlas_city.code) = 'PL' and lower(ve.city) = lower(btrim(atlas_city.city))
  )
  select case when not exists (select 1 from a) and not exists (select 1 from v) then null else jsonb_build_object(
    'artists', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'image_id', a.image_id) order by a.name) from a), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name_pl', g.name_pl, 'name_en', g.name_en) order by n desc)
      from (select rg.genre_id, count(distinct r.artist_id) as n from a
            join public.releases r on r.artist_id = a.id and r.status = 'published'
            join public.release_genres rg on rg.release_id = r.id group by rg.genre_id order by 2 desc limit 10) x
      join public.genres g on g.id = x.genre_id), '[]'::jsonb),
    'venues', coalesce((select jsonb_agg(jsonb_build_object('slug', v.slug::text, 'name', v.name,
        'upcoming', (select count(*) from public.events e where e.venue_id = v.id and e.status = 'published' and e.starts_at > now())) order by v.name)
      from v), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at,
        'venue', v.name, 'venue_slug', v.slug::text, 'artist', ar.name, 'artist_slug', ar.slug::text) order by e.starts_at)
      from v join public.events e on e.venue_id = v.id and e.status = 'published' and e.starts_at > now()
      join public.artists ar on ar.id = e.artist_id and ar.status = 'active'
      where e.starts_at < now() + interval '90 days'), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.atlas_city(text, text) from public;
grant execute on function public.atlas_city(text, text) to anon, authenticated;
