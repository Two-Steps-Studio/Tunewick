-- Playlist covers: the artwork of the first (up to) four different releases in a playlist, in
-- playlist order, for a 2x2 mosaic. One call for a whole list of playlists. Runs as the caller
-- (security invoker): RLS decides which playlists, tracks and releases they may see.

create function public.playlist_covers(ids uuid[])
returns table (playlist_id uuid, artwork_ids uuid[])
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, coalesce(c.artwork_ids, '{}')
  from unnest(ids[1:200]) as l (id)
  left join lateral (
    select array_agg(x.artwork_image_id order by x.first_position) as artwork_ids
    from (
      select r.artwork_image_id, min(pt.position) as first_position
      from public.playlist_tracks pt
      join public.tracks t on t.id = pt.track_id
      join public.releases r on r.id = t.release_id
      where pt.playlist_id = l.id
        and r.artwork_image_id is not null
        and public.release_is_public(r.id)
      group by r.artwork_image_id
      order by first_position
      limit 4
    ) x
  ) c on true;
$$;

revoke execute on function public.playlist_covers(uuid[]) from public;
grant execute on function public.playlist_covers(uuid[]) to anon, authenticated;
