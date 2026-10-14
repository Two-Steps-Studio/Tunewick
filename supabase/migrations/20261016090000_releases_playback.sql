-- Playback for many releases in one call: what release_playback returns per release, plus the
-- release's accepted cover variants. Pages that list music (browse, search, playlists, library,
-- charts) made three requests per release before (playback, cover id, cover variants); across
-- regions every request costs a round trip. Same visibility rule: release_playback checks
-- can_view_release, and a cover is only returned with rows the caller may see.
create function public.releases_playback(releases uuid[])
returns table (
  release_id uuid,
  track_id uuid,
  upload_id uuid,
  source jsonb,
  variants jsonb,
  artwork jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.track_id, p.upload_id, p.source, p.variants,
    case when i.status = 'accepted' then i.variants end
  from unnest(releases[1:100]) with ordinality as x(id, ord)
  join public.releases r on r.id = x.id
  left join public.images i on i.id = r.artwork_image_id
  cross join lateral public.release_playback(r.id) with ordinality as p(track_id, upload_id, source, variants, n)
  order by x.ord, p.n;
$$;

revoke execute on function public.releases_playback(uuid[]) from public;
grant execute on function public.releases_playback(uuid[]) to anon, authenticated;
