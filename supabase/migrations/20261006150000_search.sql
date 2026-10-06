-- Catalog search (M6.2): artists, releases, tracks — public data only, Polish-aware.
--
-- Matching works on a normalized form (lower case, Polish diacritics removed: "Łódź" → "lodz"),
-- so people can type without Polish characters. Results come from, in order of strength: whole
-- name, name prefix, a word prefix, a substring, then trigram similarity for typos.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

/** lower(unaccent(text)); unaccent itself is only STABLE, the fixed dictionary makes this safe. */
create function public.search_normalize(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, '')));
$$;

create index artists_search_idx on public.artists
  using gin (public.search_normalize(name) extensions.gin_trgm_ops);
create index releases_search_idx on public.releases
  using gin (public.search_normalize(title) extensions.gin_trgm_ops);
create index tracks_search_idx on public.tracks
  using gin (public.search_normalize(title) extensions.gin_trgm_ops);

/**
 * Ranked matches across the public catalog. Security invoker (RLS applies) plus explicit public
 * filters, so even members never see their own drafts in search.
 */
create function public.search_catalog(query text, max_results integer default 8)
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
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      public.search_normalize(btrim(left(query, 80))) as text,
      -- LIKE patterns with the user's %, _ and \ escaped
      replace(replace(replace(public.search_normalize(btrim(left(query, 80))), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  ),
  candidates as (
    select 'artist' as kind, a.id, a.name as title, a.name as artist_name, a.slug::text as artist_slug,
      null::uuid as release_id, null::text as release_slug, null::text as release_title, null::public.release_type as release_type,
      a.image_id, public.search_normalize(a.name) as normalized
    from public.artists a
    where a.status = 'active'
    union all
    select 'release', r.id, r.title, a.name, a.slug::text, r.id, r.slug::text, r.title, r.type,
      r.artwork_image_id, public.search_normalize(r.title)
    from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
    union all
    select 'track', t.id, t.title, a.name, a.slug::text, r.id, r.slug::text, r.title, r.type,
      r.artwork_image_id, public.search_normalize(t.title)
    from public.tracks t
    join public.releases r on r.id = t.release_id
    join public.artists a on a.id = r.artist_id
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
  ),
  scored as (
    select c.*,
      case
        when c.normalized = q.text then 1.0
        when c.normalized like q.pattern || '%' then 0.9
        when c.normalized like '% ' || q.pattern || '%' then 0.8
        when c.normalized like '%' || q.pattern || '%' then 0.6
        else extensions.similarity(c.normalized, q.text) * 0.7
      end::real as score
    from candidates c, q
    where char_length(q.text) >= 2
      and (c.normalized like '%' || q.pattern || '%' or extensions.similarity(c.normalized, q.text) > 0.3)
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
$$;

grant execute on function public.search_normalize(text) to anon, authenticated;
grant execute on function public.search_catalog(text, integer) to anon, authenticated;
