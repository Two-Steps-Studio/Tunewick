-- Release editing helpers (M2.3). Functions run as the caller (security invoker), so the
-- catalog RLS policies still decide who may change what; they only make multi-row edits atomic.

-- At most three genres per release.
create function private.limit_release_genres()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.release_genres g where g.release_id = new.release_id) > 3 then
    raise exception 'a release can have at most 3 genres' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger release_genres_limit
  after insert on public.release_genres
  deferrable initially deferred
  for each row execute function private.limit_release_genres();

-- Append a track at the end of disc 1.
create function public.add_track(release uuid, title text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.tracks (release_id, disc_number, track_number, title)
  values (
    add_track.release, 1,
    coalesce((select max(t.track_number) from public.tracks t
              where t.release_id = add_track.release and t.disc_number = 1), 0) + 1,
    btrim(add_track.title)
  )
  returning id;
$$;

-- Swap a track with its neighbour (direction -1 = up, 1 = down) in one transaction.
create function public.move_track(track uuid, direction smallint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_track public.tracks%rowtype;
  neighbour uuid;
begin
  if direction not in (-1, 1) then
    raise exception 'direction must be -1 or 1' using errcode = '22023';
  end if;
  select * into current_track from public.tracks t where t.id = track for update;
  if not found then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  select t.id into neighbour from public.tracks t
  where t.release_id = current_track.release_id
    and t.disc_number = current_track.disc_number
    and t.track_number = current_track.track_number + direction
  for update;
  if neighbour is null then
    return; -- already first/last
  end if;

  set constraints public.tracks_position deferred;
  update public.tracks set track_number = current_track.track_number where id = neighbour;
  update public.tracks set track_number = current_track.track_number + direction where id = track;
end;
$$;

-- Delete a track and close the gap in numbering.
create function public.delete_track(track uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed public.tracks%rowtype;
begin
  delete from public.tracks t where t.id = track returning * into removed;
  if not found then
    raise exception 'track not found' using errcode = 'P0002';
  end if;
  set constraints public.tracks_position deferred;
  update public.tracks t
  set track_number = t.track_number - 1
  where t.release_id = removed.release_id
    and t.disc_number = removed.disc_number
    and t.track_number > removed.track_number;
end;
$$;

-- Replace a release's genres atomically (RLS on release_genres applies).
create function public.set_release_genres(release uuid, genre_ids smallint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.release_genres g where g.release_id = release;
  insert into public.release_genres (release_id, genre_id)
  select release, unnest(genre_ids);
  set constraints public.release_genres_limit immediate;
end;
$$;

revoke execute on function
  public.add_track(uuid, text),
  public.move_track(uuid, smallint),
  public.delete_track(uuid),
  public.set_release_genres(uuid, smallint[])
from public, anon;
grant execute on function
  public.add_track(uuid, text),
  public.move_track(uuid, smallint),
  public.delete_track(uuid),
  public.set_release_genres(uuid, smallint[])
to authenticated;
