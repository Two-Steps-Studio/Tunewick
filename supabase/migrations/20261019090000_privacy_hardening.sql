-- Privacy hardening after the pre-launch security review.
--
-- 1. "Followers" visibility now means people the owner follows back (mutual follows). Following
--    needs no approval, so "anyone who follows me" let any account opt itself in.
-- 2. Activity visibility also honours a private profile, like every other visibility level.
-- 3. Unlisted playlists are no longer listable through the table: they open only by id, through
--    public.open_playlist. Public playlists are listed only when the owner shares activity.
-- 4. The discovery leaderboard leaves out people whose profile or score is not public to the caller.

/** Whether `a` and `b` follow each other. */
create function private.follow_each_other(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null
    and exists (select 1 from public.user_follows f where f.follower_id = a and f.followee_id = b)
    and exists (select 1 from public.user_follows f where f.follower_id = b and f.followee_id = a);
$$;

revoke execute on function private.follow_each_other(uuid, uuid) from public, anon, authenticated;

/**
 * Whether the caller may see `owner`'s data behind `level`: themselves always; nobody across a
 * block; nobody when the profile is private; else public / followers (people the owner follows
 * back) / private.
 */
create or replace function private.can_view(owner uuid, level public.visibility_level)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) = owner then true
    when (select auth.uid()) is not null and private.is_blocked_between((select auth.uid()), owner) then false
    when not coalesce((select s.profile_public from public.profile_settings s where s.user_id = owner), true) then false
    when level = 'public' then true
    when level = 'followers' then private.follow_each_other((select auth.uid()), owner)
    else false
  end;
$$;

/** Whether the signed-in person (or an anonymous visitor) may see `owner`'s activity. */
create or replace function private.can_view_activity(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view(owner, coalesce(
    (select s.activity_visibility from public.profile_settings s where s.user_id = owner), 'private'));
$$;

-- Playlists: the table lists only your own and shared public ones.

create or replace function public.can_view_playlist(playlist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = playlist
      and (p.owner_id = (select auth.uid())
        or (p.visibility = 'public' and private.can_view_activity(p.owner_id)))
  );
$$;

-- The read policy below runs as the caller; private is not exposed through the API.
grant execute on function private.can_view_activity(uuid) to anon, authenticated;

drop policy playlists_read on public.playlists;
create policy playlists_read on public.playlists for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or (visibility = 'public' and private.can_view_activity(owner_id))
  );

/**
 * One playlist by id - the owner's, or a public or unlisted one (a link is enough), never across a
 * block - with its items in order. Null when the caller may not open it. Tracks are read by the
 * caller afterwards, so music that is no longer public stays hidden by RLS.
 */
create function public.open_playlist(playlist uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'owner_id', p.owner_id,
    'title', p.title,
    'description', p.description,
    'visibility', p.visibility,
    'updated_at', p.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'position', t.position, 'added_at', t.added_at, 'track_id', t.track_id)
        order by t.position, t.added_at)
      from public.playlist_tracks t where t.playlist_id = p.id), '[]'::jsonb))
  from public.playlists p
  where p.id = open_playlist.playlist
    and (p.owner_id = (select auth.uid())
      or (p.visibility in ('public', 'unlisted')
        and not ((select auth.uid()) is not null and private.is_blocked_between((select auth.uid()), p.owner_id))));
$$;

revoke execute on function public.open_playlist(uuid) from public;
grant execute on function public.open_playlist(uuid) to anon, authenticated;

-- Leaderboard: only people whose score the caller may see (and the caller themselves).

create or replace function public.discovery_leaderboard(
  period text default 'week',
  country text default null,
  macro_region text default null,
  max_results integer default 50
)
returns table (rank integer, handle text, display_name text, points integer, discoveries integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.rank, pr.handle::text, pr.display_name, s.points, s.discoveries, s.user_id = (select auth.uid())
  from private.period_scores(period, country, macro_region) s
  join public.profiles pr on pr.id = s.user_id and pr.deleted_at is null and pr.handle is not null
  left join public.listener_preferences lp on lp.user_id = s.user_id
  left join public.profile_settings ps on ps.user_id = s.user_id
  where coalesce(lp.show_in_rankings, true)
    and private.can_view(s.user_id, coalesce(ps.score_visibility, 'public'))
    and period in ('week', 'last_week', 'month', 'season', 'last_season', 'all')
  order by s.rank, pr.handle
  limit least(greatest(max_results, 1), 100);
$$;
