-- Playlists (M5.2, docs/database.md §3.6). Manual playlists with fractional positions (cheap
-- reorder; renormalized when gaps get tiny). Duplicates are allowed. Tracks that stop being
-- public stay in the playlist but are hidden by the catalog's RLS until they come back.

create type public.playlist_visibility as enum ('public', 'unlisted', 'private');

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null constraint playlists_title_length check (char_length(trim(title)) between 1 and 100),
  description text constraint playlists_description_length check (char_length(description) <= 500),
  visibility public.playlist_visibility not null default 'private',
  kind text not null default 'manual' constraint playlists_kind check (kind in ('manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playlists_owner_idx on public.playlists (owner_id, updated_at desc);

create table public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position double precision not null,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);

create index playlist_tracks_order_idx on public.playlist_tracks (playlist_id, position);

/** Owner, or anyone for public and unlisted (unlisted = whoever has the link). */
create function public.can_view_playlist(playlist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = playlist
      and (p.owner_id = (select auth.uid()) or p.visibility in ('public', 'unlisted'))
  );
$$;

create function private.require_playlist_owner(playlist uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.playlists p where p.id = playlist and p.owner_id = (select auth.uid())) then
    raise exception 'not your playlist' using errcode = '42501';
  end if;
end;
$$;

/** Counted outside RLS (a policy on playlists cannot query playlists). */
create function private.playlist_count(owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.playlists p where p.owner_id = owner;
$$;

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

create policy playlists_read on public.playlists for select to anon, authenticated
  using (owner_id = (select auth.uid()) or visibility in ('public', 'unlisted'));
create policy playlists_insert on public.playlists for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.playlist_count((select auth.uid())) < 200
  );
create policy playlists_update on public.playlists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy playlists_delete on public.playlists for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy playlist_tracks_read on public.playlist_tracks for select to anon, authenticated
  using (public.can_view_playlist(playlist_id));
create policy playlist_tracks_delete on public.playlist_tracks for delete to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));

revoke all on public.playlists, public.playlist_tracks from anon, authenticated;
grant select on public.playlists, public.playlist_tracks to anon, authenticated;
grant insert (title, description, visibility) on public.playlists to authenticated;
grant update (title, description, visibility) on public.playlists to authenticated;
grant delete on public.playlists, public.playlist_tracks to authenticated;

create function private.touch_playlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.playlists p set updated_at = now()
  where p.id = coalesce(new.playlist_id, old.playlist_id);
  return null;
end;
$$;

create trigger playlist_tracks_touch after insert or update or delete on public.playlist_tracks
  for each row execute function private.touch_playlist();

create function private.playlist_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger playlists_updated_at before update on public.playlists
  for each row execute function private.playlist_set_updated_at();

-- ---------------------------------------------------------------------------
-- Track list changes (owner only, through functions: positions are computed here)
-- ---------------------------------------------------------------------------

/** Appends a public track; returns the new item id. At most 1000 items per playlist. */
create function public.add_playlist_track(playlist uuid, track uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  added uuid;
begin
  perform private.require_playlist_owner(playlist);
  -- Serialize appends to one playlist (two tabs adding at once get distinct positions).
  perform 1 from public.playlists p where p.id = playlist for update;
  if not public.release_is_public((select t.release_id from public.tracks t where t.id = track)) then
    raise exception 'only public tracks can be added' using errcode = '42501';
  end if;
  if (select count(*) from public.playlist_tracks pt where pt.playlist_id = playlist) >= 1000 then
    raise exception 'a playlist holds at most 1000 tracks' using errcode = '54000';
  end if;
  insert into public.playlist_tracks (playlist_id, track_id, position, added_by)
  values (playlist, track,
    coalesce((select max(pt.position) from public.playlist_tracks pt where pt.playlist_id = playlist), 0) + 1,
    (select auth.uid()))
  returning id into added;
  return added;
end;
$$;

/**
 * Moves an item to `to_index` (0-based, in the current order). The new position is the midpoint
 * of its new neighbours; when that gap gets too small the playlist is renumbered 1, 2, 3, …
 */
create function public.move_playlist_track(item uuid, to_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  list uuid;
  before_pos double precision;
  after_pos double precision;
  new_pos double precision;
begin
  select pt.playlist_id into list from public.playlist_tracks pt where pt.id = item;
  if list is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  perform private.require_playlist_owner(list);
  perform 1 from public.playlists p where p.id = list for update;

  -- Neighbours in the order without the moved item.
  select o.position into before_pos from (
    select pt.position, row_number() over (order by pt.position, pt.added_at) - 1 as idx
    from public.playlist_tracks pt where pt.playlist_id = list and pt.id <> item
  ) o where o.idx = to_index - 1;
  select o.position into after_pos from (
    select pt.position, row_number() over (order by pt.position, pt.added_at) - 1 as idx
    from public.playlist_tracks pt where pt.playlist_id = list and pt.id <> item
  ) o where o.idx = to_index;

  new_pos := case
    when before_pos is null and after_pos is null then 1
    when before_pos is null then after_pos - 1
    when after_pos is null then before_pos + 1
    else (before_pos + after_pos) / 2
  end;
  update public.playlist_tracks pt set position = new_pos where pt.id = item;

  if before_pos is not null and after_pos is not null and after_pos - before_pos < 1e-9 then
    update public.playlist_tracks pt set position = o.idx
    from (
      select x.id, row_number() over (order by x.position, x.added_at) as idx
      from public.playlist_tracks x where x.playlist_id = list
    ) o
    where pt.id = o.id;
  end if;
end;
$$;

revoke execute on function public.can_view_playlist(uuid) from public;
grant execute on function public.can_view_playlist(uuid) to anon, authenticated;
revoke execute on function private.require_playlist_owner(uuid) from public, anon, authenticated;
revoke execute on function private.playlist_count(uuid) from public, anon;
grant execute on function private.playlist_count(uuid) to authenticated;
revoke execute on function public.add_playlist_track(uuid, uuid) from public, anon;
revoke execute on function public.move_playlist_track(uuid, integer) from public, anon;
grant execute on function public.add_playlist_track(uuid, uuid) to authenticated;
grant execute on function public.move_playlist_track(uuid, integer) to authenticated;
