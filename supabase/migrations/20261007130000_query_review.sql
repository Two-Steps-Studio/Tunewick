-- Query review (M11.5, architecture.md §11). Measured with scripts/db/query-review.sql at ~10x the
-- closed beta (3 000 artists, 12 000 releases, 60 000 tracks, 1M listens):
--   search_catalog 7.2 s, discover_releases 0.9 s, discover_artists 1.0 s.
-- Cause: these security-invoker functions read every catalog row through RLS, and the release/track
-- policies call can_view_release() once per row; search also filtered with similarity(), which no
-- index can serve. Fix: the three functions become security definer with the same explicit public
-- filters they already had (published, publish_at <= now(), artist active) — RLS added nothing but
-- cost — and search filters each source with the trigram-indexed expression directly.
-- Plus indexes on foreign keys that hot paths and cascades read.

create index if not exists events_artist_idx on public.events (artist_id, starts_at);
create index if not exists event_attendance_event_idx on public.event_attendance (event_id);
create index if not exists credits_artist_idx on public.credits (artist_id) where artist_id is not null;
create index if not exists release_artists_artist_idx on public.release_artists (artist_id);
create index if not exists track_artists_artist_idx on public.track_artists (artist_id);
create index if not exists release_genres_genre_idx on public.release_genres (genre_id);
create index if not exists release_likes_release_idx on public.release_likes (release_id);
create index if not exists track_likes_track_idx on public.track_likes (track_id);
create index if not exists playlist_tracks_track_idx on public.playlist_tracks (track_id);
create index if not exists listening_events_track_idx on public.listening_events (track_id);
create index if not exists moderation_decisions_owner_idx on public.moderation_decisions (owner_id, decided_at desc)
  where owner_id is not null;
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code_id);
create index if not exists releases_public_idx on public.releases (publish_at desc) where status = 'published';

/** New releases from all of Poland (or one region): each artist's newest public release. */
create or replace function public.discover_releases(region public.voivodeship default null, max_results integer default 12)
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
security definer
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
create or replace function public.discover_artists(region public.voivodeship default null, max_results integer default 12)
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
security definer
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

/**
 * Ranked matches across the public catalog. Security definer with explicit public filters (only
 * published releases of active artists), so even members never see their own drafts in search.
 * Each source is filtered by its trigram-indexed expression: substring (LIKE) or similar (%, the
 * default pg_trgm threshold 0.3 — the same cut-off as before).
 */
create or replace function public.search_catalog(query text, max_results integer default 8)
returns table (
  kind text,
  id uuid,
  title text,
  artist_name text,
  artist_slug text,
  release_id uuid,
  release_slug text,
  release_title text,
  release_type public.release_type,
  image_id uuid,
  score real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  needle text := public.search_normalize(btrim(left(query, 80)));
  -- LIKE pattern with the user's %, _ and \ escaped
  pattern text := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  contains text := '%' || pattern || '%';
begin
  if char_length(needle) < 2 then
    return;
  end if;
  return query
  with candidates as (
    select 'artist' as kind, a.id, a.name as title, a.name as artist_name, a.slug::text as artist_slug,
      null::uuid as release_id, null::text as release_slug, null::text as release_title,
      null::public.release_type as release_type, a.image_id, public.search_normalize(a.name) as normalized
    from public.artists a
    where a.status = 'active'
      and (public.search_normalize(a.name) like contains
        or public.search_normalize(a.name) operator(extensions.%) needle)
    union all
    select 'release', r.id, r.title, a.name, a.slug::text, r.id, r.slug::text, r.title, r.type,
      r.artwork_image_id, public.search_normalize(r.title)
    from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (public.search_normalize(r.title) like contains
        or public.search_normalize(r.title) operator(extensions.%) needle)
    union all
    select 'track', t.id, t.title, a.name, a.slug::text, r.id, r.slug::text, r.title, r.type,
      r.artwork_image_id, public.search_normalize(t.title)
    from public.tracks t
    join public.releases r on r.id = t.release_id
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (public.search_normalize(t.title) like contains
        or public.search_normalize(t.title) operator(extensions.%) needle)
  ),
  scored as (
    select c.*,
      case
        when c.normalized = needle then 1.0
        when c.normalized like pattern || '%' then 0.9
        when c.normalized like '% ' || pattern || '%' then 0.8
        when c.normalized like contains then 0.6
        else extensions.similarity(c.normalized, needle) * 0.7
      end::real as score
    from candidates c
  ),
  ranked as (
    select s.*, row_number() over (partition by s.kind order by s.score desc, s.title) as position
    from scored s
  )
  select r.kind, r.id, r.title, r.artist_name, r.artist_slug, r.release_id, r.release_slug, r.release_title,
    r.release_type, r.image_id, r.score
  from ranked r
  where r.position <= least(greatest(max_results, 1), 20)
  order by case r.kind when 'artist' then 1 when 'release' then 2 else 3 end, r.score desc, r.title;
end;
$$;
