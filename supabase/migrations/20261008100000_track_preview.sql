-- The artist picks the preview the Discover feed plays (the soundcheck columns exist since M2).
-- It does not change the music, so owners and managers may set it at any time — also after
-- publishing, unlike the rest of the track.

/**
 * Sets (start + length) or clears (both null: automatic window) a track's preview. 15–30 s,
 * inside the track when its length is known.
 */
create function public.set_track_preview(track uuid, start_ms integer, length_ms integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select tr.id, tr.duration_ms, r.artist_id into t
  from public.tracks tr join public.releases r on r.id = tr.release_id
  where tr.id = set_track_preview.track;
  if t.id is null or not public.is_artist_member(t.artist_id, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'only owners and managers set the preview' using errcode = '42501';
  end if;
  if (start_ms is null) <> (length_ms is null) then
    raise exception 'give both start and length, or neither' using errcode = '22023';
  end if;
  if start_ms is not null and (
    start_ms < 0 or length_ms not between 15000 and 30000
    or (t.duration_ms is not null and start_ms + length_ms > t.duration_ms)
  ) then
    raise exception 'the preview must be 15–30 s inside the track' using errcode = '22023';
  end if;
  update public.tracks
  set soundcheck_start_ms = set_track_preview.start_ms, soundcheck_duration_ms = set_track_preview.length_ms
  where id = t.id;
end;
$$;

revoke execute on function public.set_track_preview(uuid, integer, integer) from public, anon;
grant execute on function public.set_track_preview(uuid, integer, integer) to authenticated;
