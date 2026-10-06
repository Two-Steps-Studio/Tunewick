-- Discover home (M6.3): new music from all of Poland, optionally narrowed to a voivodeship.
-- Public data only (security invoker + explicit public filters). Every row carries the facts the
-- page turns into a true reason ("Debut", "New · 3 days ago", "Suwałki · Podlaskie") —
-- nothing is ranked by engagement yet; there is no listening data to rank by honestly.

/** Newest public releases, at most one per artist (the artist's newest), newest first. */
create function public.discover_releases(region public.voivodeship default null, max_results integer default 12)
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
  is_debut boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with public_releases as (
    select r.*, a.name as artist_name, a.slug as artist_slug, a.city, a.voivodeship,
      row_number() over (partition by r.artist_id order by r.publish_at desc) as newest,
      count(*) over (partition by r.artist_id) as release_count
    from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (discover_releases.region is null or a.voivodeship = discover_releases.region)
  )
  select p.id, p.slug::text, p.title, p.type, p.publish_at, p.artwork_image_id, p.artist_name,
    p.artist_slug::text, p.city, p.voivodeship, p.release_count = 1
  from public_releases p
  where p.newest = 1
  order by p.publish_at desc
  limit least(greatest(discover_releases.max_results, 1), 48);
$$;

/** Artists by their first public release (newest debuts first). */
create function public.discover_artists(region public.voivodeship default null, max_results integer default 12)
returns table (
  artist_id uuid,
  artist_slug text,
  name text,
  image_id uuid,
  city text,
  voivodeship public.voivodeship,
  verification_status public.artist_verification,
  first_release_at timestamptz,
  release_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.slug::text, a.name, a.image_id, a.city, a.voivodeship, a.verification_status,
    min(r.publish_at), count(r.id)::integer
  from public.artists a
  join public.releases r on r.artist_id = a.id and r.status = 'published' and r.publish_at <= now()
  where a.status = 'active'
    and (discover_artists.region is null or a.voivodeship = discover_artists.region)
  group by a.id
  order by min(r.publish_at) desc
  limit least(greatest(discover_artists.max_results, 1), 48);
$$;

grant execute on function public.discover_releases(public.voivodeship, integer) to anon, authenticated;
grant execute on function public.discover_artists(public.voivodeship, integer) to anon, authenticated;
