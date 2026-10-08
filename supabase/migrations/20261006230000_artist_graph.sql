-- Music Graph, first slice (M7.2, product.md §4.6, docs/database.md graph_edges): artist ↔ artist
-- relations derived from public catalog data, each with the evidence that makes its reason true.
-- graph_edges is derived, never a source of truth: rebuilt by private.refresh_artist_graph()
-- whenever public music changes. Audience overlap and place are computed live in
-- related_artists() (they change with every follow).

create table public.graph_edges (
  src_type text not null,
  src_id uuid not null,
  dst_type text not null,
  dst_id uuid not null,
  relation text not null,
  weight real not null default 1,
  -- What makes the relation true, e.g. {"name": "Jan Kowalski", "role": "producer"}.
  derived_from jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now(),
  primary key (src_type, src_id, dst_type, dst_id, relation)
);

create index graph_edges_dst_idx on public.graph_edges (dst_type, dst_id);

alter table public.graph_edges enable row level security;
-- Built from public data only, so it may be read by anyone.
create policy graph_edges_read on public.graph_edges for select to anon, authenticated using (true);
revoke all on public.graph_edges from anon, authenticated;
grant select on public.graph_edges to anon, authenticated;

/** Public tracks with their owning artist and label — the only input of the artist graph. */
create view private.public_tracks as
  select t.id as track_id, t.title, r.id as release_id, r.slug as release_slug, r.title as release_title,
    r.artist_id, r.label_id
  from public.tracks t
  join public.releases r on r.id = t.release_id
  where public.release_is_public(r.id);

revoke all on private.public_tracks from public, anon, authenticated;

/** Rebuilds the artist ↔ artist edges from public releases (both directions stored). */
create function private.refresh_artist_graph()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.graph_edges where src_type = 'artist' and dst_type = 'artist'
    and relation in ('collaborated', 'shared_credit', 'same_label');

  -- 1. Collaboration: a public track of A credits or features artist B.
  insert into public.graph_edges (src_type, src_id, dst_type, dst_id, relation, weight, derived_from)
  select 'artist', a, 'artist', b, 'collaborated', count(*),
    -- Evidence from one row, so the track and its release always belong together.
    (array_agg(jsonb_build_object('track', title, 'release', release_title) order by title, release_title))[1]
  from (
    select p.artist_id as a, c.artist_id as b, p.title, p.release_title
    from private.public_tracks p join public.credits c on c.track_id = p.track_id
    where c.artist_id is not null and c.artist_id <> p.artist_id
    union all
    select p.artist_id, ta.artist_id, p.title, p.release_title
    from private.public_tracks p join public.track_artists ta on ta.track_id = p.track_id
    where ta.artist_id <> p.artist_id
    union all
    select c.artist_id, p.artist_id, p.title, p.release_title
    from private.public_tracks p join public.credits c on c.track_id = p.track_id
    where c.artist_id is not null and c.artist_id <> p.artist_id
    union all
    select ta.artist_id, p.artist_id, p.title, p.release_title
    from private.public_tracks p join public.track_artists ta on ta.track_id = p.track_id
    where ta.artist_id <> p.artist_id
  ) pairs
  where exists (select 1 from public.artists x where x.id = b and x.status = 'active')
    and exists (select 1 from public.artists x where x.id = a and x.status = 'active')
  group by a, b;

  -- 2. The same person behind the music of both (producer, mixing, mastering, songwriting).
  insert into public.graph_edges (src_type, src_id, dst_type, dst_id, relation, weight, derived_from)
  select 'artist', x.artist_id, 'artist', y.artist_id, 'shared_credit', count(distinct x.person),
    -- Evidence from one row: this person really had this role on both sides.
    (array_agg(jsonb_build_object('name', x.name, 'role', x.role::text) order by x.name, x.role))[1]
  from (
    select p.artist_id, public.search_normalize(c.name) as person, c.name, c.role
    from private.public_tracks p join public.credits c on c.track_id = p.track_id
    where c.role in ('producer', 'mixing_engineer', 'mastering_engineer', 'songwriter', 'composer', 'lyricist')
  ) x
  join (
    select p.artist_id, public.search_normalize(c.name) as person, c.role
    from private.public_tracks p join public.credits c on c.track_id = p.track_id
    where c.role in ('producer', 'mixing_engineer', 'mastering_engineer', 'songwriter', 'composer', 'lyricist')
  ) y on y.person = x.person and y.role = x.role and y.artist_id <> x.artist_id
  group by x.artist_id, y.artist_id;

  -- 3. The same label.
  insert into public.graph_edges (src_type, src_id, dst_type, dst_id, relation, weight, derived_from)
  select 'artist', x.artist_id, 'artist', y.artist_id, 'same_label', 1, jsonb_build_object('label', min(l.name))
  from (select distinct artist_id, label_id from private.public_tracks where label_id is not null) x
  join (select distinct artist_id, label_id from private.public_tracks where label_id is not null) y
    on y.label_id = x.label_id and y.artist_id <> x.artist_id
  join public.labels l on l.id = x.label_id
  group by x.artist_id, y.artist_id;
end;
$$;

revoke execute on function private.refresh_artist_graph() from public, anon, authenticated;

-- Public music changes (publish, takedown, artist suspended) → rebuild. Cheap at beta scale;
-- becomes an incremental job when the catalog grows.
create function private.refresh_artist_graph_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_artist_graph();
  return null;
end;
$$;

create trigger releases_refresh_graph
  after update of status, publish_at on public.releases
  for each statement execute function private.refresh_artist_graph_trigger();
create trigger artists_refresh_graph
  after update of status on public.artists
  for each statement execute function private.refresh_artist_graph_trigger();

/**
 * Artists related to `artist`, strongest first, each with a true reason:
 * collaborated (on a track), shared_credit (same producer/mixer/author), same_label,
 * shared_audience (≥ 3 accounts follow both — a count, never who), same_city.
 */
create function public.related_artists(artist uuid, max_results integer default 8)
returns table (
  artist_id uuid,
  slug text,
  name text,
  image_id uuid,
  city text,
  voivodeship public.voivodeship,
  relation text,
  evidence jsonb,
  score real
)
language sql
stable
security definer
set search_path = ''
as $$
  with source as (
    select a.id, a.city, a.voivodeship from public.artists a where a.id = related_artists.artist and a.status = 'active'
  ),
  candidates as (
    select e.dst_id as id, e.relation, e.derived_from as evidence,
      -- Working together beats sharing people, which beats a shared label.
      case e.relation
        when 'collaborated' then 10 * e.weight
        when 'shared_credit' then 4 + 2 * least(e.weight, 2)
        else 3 * e.weight
      end as score
    from public.graph_edges e
    where e.src_type = 'artist' and e.dst_type = 'artist' and e.src_id = related_artists.artist
    union all
    select f2.artist_id, 'shared_audience', jsonb_build_object('followers', count(*)), 2 * count(*)
    from public.artist_follows f1
    join public.artist_follows f2 on f2.user_id = f1.user_id and f2.artist_id <> f1.artist_id
    where f1.artist_id = related_artists.artist
    group by f2.artist_id
    having count(*) >= 3
    union all
    select a.id, 'same_city', jsonb_build_object('city', a.city), 1
    from public.artists a, source s
    where a.id <> s.id and a.status = 'active' and s.city is not null
      and public.search_normalize(a.city) = public.search_normalize(s.city)
      and a.voivodeship is not distinct from s.voivodeship
  ),
  best as (
    -- One row per artist: the strongest reason, the sum of all as the score.
    select distinct on (c.id) c.id, c.relation, c.evidence,
      sum(c.score) over (partition by c.id) as total
    from candidates c
    order by c.id, c.score desc
  )
  select a.id, a.slug::text, a.name, a.image_id, a.city, a.voivodeship, b.relation, b.evidence, b.total::real
  from best b
  join public.artists a on a.id = b.id and a.status = 'active'
  -- Only artists with public music: a related artist must have something to hear.
  where exists (select 1 from public.releases r where r.artist_id = a.id and public.release_is_public(r.id))
  order by b.total desc, a.name
  limit least(greatest(max_results, 1), 24);
$$;

revoke execute on function public.related_artists(uuid, integer) from public;
grant execute on function public.related_artists(uuid, integer) to anon, authenticated;

select private.refresh_artist_graph();
