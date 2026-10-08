-- Events and venues (M8.1, product.md §4.5, database.md §3.7). Artists add their gigs; a
-- moderator publishes them ("only real, moderated events are published"). Venues are created
-- along the way (unverified until staff verify them). Places reuse artists' model: city text +
-- voivodeship (all of Poland, D6).

create type public.event_status as enum ('pending', 'published', 'rejected', 'cancelled');

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique constraint venues_slug_format check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug::text) between 2 and 80),
  name text not null constraint venues_name_length check (char_length(trim(name)) between 2 and 120),
  city text not null constraint venues_city_length check (char_length(trim(city)) between 2 and 80),
  voivodeship public.voivodeship not null,
  address text constraint venues_address_length check (char_length(address) <= 200),
  website text constraint venues_website check (website is null or website ~ '^https://'),
  verified boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index venues_search_idx on public.venues using gin (public.search_normalize(name) extensions.gin_trgm_ops);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint events_title_length check (char_length(trim(title)) between 2 and 160),
  description text constraint events_description_length check (char_length(description) <= 2000),
  venue_id uuid not null references public.venues (id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_url text constraint events_ticket_url check (ticket_url is null or ticket_url ~ '^https://'),
  status public.event_status not null default 'pending',
  -- Who added it: the artist profile (MVP); venues and admins later.
  artist_id uuid not null references public.artists (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint events_period check (ends_at is null or ends_at > starts_at)
);

create index events_upcoming_idx on public.events (status, starts_at);
create index events_venue_idx on public.events (venue_id, starts_at);

create table public.event_lineup (
  event_id uuid not null references public.events (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  position smallint not null default 0,
  primary key (event_id, artist_id)
);

create index event_lineup_artist_idx on public.event_lineup (artist_id);

/** Public: published and the venue exists. Members of the adding artist and staff see more. */
create function public.can_view_event(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = event
      and (e.status in ('published', 'cancelled') or public.is_artist_member(e.artist_id) or public.is_staff())
  );
$$;

alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_lineup enable row level security;

create policy venues_read on public.venues for select to anon, authenticated using (true);
create policy events_read on public.events for select to anon, authenticated using (public.can_view_event(id));
create policy event_lineup_read on public.event_lineup for select to anon, authenticated using (public.can_view_event(event_id));

revoke all on public.venues, public.events, public.event_lineup from anon, authenticated;
grant select on public.venues, public.events, public.event_lineup to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing (functions only: lineup and venue rules live here)
-- ---------------------------------------------------------------------------

/** Finds a venue by name and city or creates it (unverified). */
create function public.find_or_create_venue(name text, city text, voivodeship public.voivodeship,
  address text default null, website text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found uuid;
  base text;
  candidate text;
  n integer := 1;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in to add venues' using errcode = '42501';
  end if;
  select v.id into found from public.venues v
  where public.search_normalize(v.name) = public.search_normalize(trim(find_or_create_venue.name))
    and public.search_normalize(v.city) = public.search_normalize(trim(find_or_create_venue.city))
  limit 1;
  if found is not null then
    return found;
  end if;
  base := trim(both '-' from regexp_replace(public.search_normalize(trim(find_or_create_venue.name) || ' ' || trim(find_or_create_venue.city)), '[^a-z0-9]+', '-', 'g'));
  base := left(coalesce(nullif(base, ''), 'miejsce'), 70);
  candidate := base;
  while exists (select 1 from public.venues v where v.slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  insert into public.venues (slug, name, city, voivodeship, address, website, created_by)
  values (candidate, trim(find_or_create_venue.name), trim(find_or_create_venue.city), find_or_create_venue.voivodeship,
    nullif(trim(find_or_create_venue.address), ''), nullif(trim(find_or_create_venue.website), ''), (select auth.uid()))
  returning id into found;
  return found;
end;
$$;

/**
 * An artist (owner/manager) adds a gig at a venue; the lineup always includes that artist and may
 * add other active artists by profile. Waits for a moderator.
 */
create function public.create_event(
  artist uuid,
  title text,
  venue uuid,
  starts_at timestamptz,
  lineup uuid[] default '{}',
  ticket_url text default null,
  description text default null,
  ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  if not public.is_artist_member(artist, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'only owners or managers add events' using errcode = '42501';
  end if;
  if create_event.starts_at < now() - interval '1 day' or create_event.starts_at > now() + interval '2 years' then
    raise exception 'events are added before they happen (up to two years ahead)' using errcode = '22023';
  end if;
  if (select count(*) from public.events e where e.artist_id = artist and e.status = 'pending') >= 20 then
    raise exception 'too many events waiting for review' using errcode = '54000';
  end if;
  insert into public.events (title, description, venue_id, starts_at, ends_at, ticket_url, artist_id, created_by)
  values (trim(create_event.title), nullif(trim(create_event.description), ''), venue, create_event.starts_at,
    create_event.ends_at, nullif(trim(create_event.ticket_url), ''), artist, (select auth.uid()))
  returning id into created;
  -- The adding artist first, then the others in the given order (duplicates dropped).
  insert into public.event_lineup (event_id, artist_id, position)
  select created, a.id, (row_number() over (order by min(a.pos)) - 1)::smallint
  from (
    select artist as id, 0::bigint as pos
    union all
    select x, o from unnest(lineup) with ordinality as t(x, o)
  ) a
  join public.artists ar on ar.id = a.id and ar.status = 'active'
  group by a.id;
  return created;
exception when check_violation then
  raise exception 'the event is incomplete or invalid' using errcode = '22023';
end;
$$;

/** The adding artist cancels a published event (it stays, marked as cancelled). */
create function public.cancel_event(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events x where x.id = event for update;
  if e.id is null or not public.is_artist_member(e.artist_id, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'not your event' using errcode = '42501';
  end if;
  update public.events x set status = 'cancelled' where x.id = event and x.status in ('pending', 'published');
end;
$$;

/** Moderator publishes or rejects (with a reason the artist sees). */
create function public.review_event(event uuid, decision text, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  perform public.require_staff('moderator');
  select * into e from public.events x where x.id = event for update;
  if e.id is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if e.status <> 'pending' then
    raise exception 'this event was already reviewed' using errcode = '55000';
  end if;
  if decision not in ('publish', 'reject') then
    raise exception 'decision must be publish or reject' using errcode = '22023';
  end if;
  if decision = 'reject' and char_length(coalesce(trim(note), '')) < 10 then
    raise exception 'a rejection needs a reason of at least 10 characters' using errcode = '22023';
  end if;
  update public.events x
  set status = case decision when 'publish' then 'published' else 'rejected' end::public.event_status,
      review_note = nullif(trim(note), ''), reviewed_by = (select auth.uid()), reviewed_at = now()
  where x.id = event;
  perform private.write_audit('event.' || decision, 'event', event::text, null, jsonb_build_object('note', note));
end;
$$;

/** Upcoming public events, soonest first, optionally in one voivodeship. */
create function public.upcoming_events(region public.voivodeship default null, max_results integer default 30)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  status public.event_status,
  ticket_url text,
  venue_slug text,
  venue_name text,
  city text,
  voivodeship public.voivodeship,
  lineup jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, e.status, e.ticket_url, v.slug::text, v.name, v.city, v.voivodeship,
    coalesce((
      select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name) order by l.position)
      from public.event_lineup l join public.artists a on a.id = l.artist_id and a.status = 'active'
      where l.event_id = e.id
    ), '[]'::jsonb)
  from public.events e
  join public.venues v on v.id = e.venue_id
  where e.status in ('published', 'cancelled')
    and coalesce(e.ends_at, e.starts_at + interval '6 hours') >= now()
    and (upcoming_events.region is null or v.voivodeship = upcoming_events.region)
  order by e.starts_at
  limit least(greatest(max_results, 1), 100);
$$;

revoke execute on function public.can_view_event(uuid) from public;
grant execute on function public.can_view_event(uuid) to anon, authenticated;
revoke execute on function public.find_or_create_venue(text, text, public.voivodeship, text, text) from public, anon;
revoke execute on function public.create_event(uuid, text, uuid, timestamptz, uuid[], text, text, timestamptz) from public, anon;
revoke execute on function public.cancel_event(uuid) from public, anon;
revoke execute on function public.review_event(uuid, text, text) from public, anon;
grant execute on function public.find_or_create_venue(text, text, public.voivodeship, text, text) to authenticated;
grant execute on function public.create_event(uuid, text, uuid, timestamptz, uuid[], text, text, timestamptz) to authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
grant execute on function public.review_event(uuid, text, text) to authenticated;
grant execute on function public.upcoming_events(public.voivodeship, integer) to anon, authenticated;
