-- M14.8 Social discovery (docs/discovery-v2.md M14.8).
--
-- Everything here goes through private.can_view(owner, level) and the owner's switches from M14.1:
-- score_visibility (XP, level, rankings among friends), badges_visibility (badges), stats_visibility
-- (discoveries, listening numbers, common ground) and profile_public (all of it). Blocks hide
-- everything both ways. Nothing is shown to a visitor that the owner's setting does not allow.

/** The caller and the people they follow, ranked by XP for a period (week, month, season, all). */
create function public.friends_leaderboard(period text default 'week')
returns table (rank integer, handle text, display_name text, points integer, discoveries integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select (select auth.uid()) as user_id
    union
    select f.followee_id from public.user_follows f
    where f.follower_id = (select auth.uid())
  ), visible as (
    select c.user_id from circle c
    where c.user_id is not null
      and private.can_view(c.user_id, coalesce(
        (select s.score_visibility from public.profile_settings s where s.user_id = c.user_id), 'public'))
  ), scores as (
    select v.user_id, coalesce(s.points, 0) as points, coalesce(s.discoveries, 0) as discoveries
    from visible v
    left join private.period_scores(period, null, null) s on s.user_id = v.user_id
  )
  select (rank() over (order by sc.points desc, sc.discoveries desc))::integer,
    pr.handle::text, pr.display_name, sc.points, sc.discoveries, sc.user_id = (select auth.uid())
  from scores sc
  join public.profiles pr on pr.id = sc.user_id and pr.deleted_at is null and pr.handle is not null
  where period in ('week', 'last_week', 'month', 'season', 'last_season', 'all')
  order by 1, pr.handle
  limit 100;
$$;

revoke execute on function public.friends_leaderboard(text) from public, anon;
grant execute on function public.friends_leaderboard(text) to authenticated;

/**
 * What the people you follow discovered and unlocked in the last 30 days: new artists (their
 * stats visibility) and badges (their badges visibility), newest first.
 */
create function public.friends_activity(max_results integer default 40)
returns table (
  handle text, display_name text, kind text, at timestamptz,
  artist_slug text, artist_name text, artist_image_id uuid, country_code text, badge text
)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select f.followee_id as user_id, s.stats_visibility, s.badges_visibility
    from public.user_follows f
    left join public.profile_settings s on s.user_id = f.followee_id
    where f.follower_id = (select auth.uid())
  ), items as (
    select fr.user_id, 'new_artist'::text as kind, p.created_at as at, a.slug, a.name, a.image_id,
      a.country_code, null::text as badge
    from friends fr
    join public.discovery_points p on p.user_id = fr.user_id and p.kind = 'new_artist'
      and p.created_at > now() - interval '30 days'
    join public.artists a on a.id = p.artist_id
    where private.can_view(fr.user_id, coalesce(fr.stats_visibility, 'followers'))
    union all
    select fr.user_id, 'badge', u.unlocked_at, null, null, null, null, u.code
    from friends fr
    join public.user_achievements u on u.user_id = fr.user_id
      and u.unlocked_at > now() - interval '30 days'
    where private.can_view(fr.user_id, coalesce(fr.badges_visibility, 'public'))
  )
  select pr.handle::text, pr.display_name, i.kind, i.at, i.slug::text, i.name, i.image_id,
    i.country_code, i.badge
  from items i
  join public.profiles pr on pr.id = i.user_id and pr.deleted_at is null and pr.handle is not null
  order by i.at desc
  limit least(greatest(max_results, 1), 100);
$$;

revoke execute on function public.friends_activity(integer) from public, anon;
grant execute on function public.friends_activity(integer) to authenticated;

/** Top artists and genres of a person over the last 90 days (for common ground). */
create function private.taste_of(person uuid)
returns table (kind text, ref text, name text, plays bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with plays as (
    select e.artist_id, e.release_id from public.listening_events e
    where e.user_id = person and e.started_at > now() - interval '90 days'
      and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
  )
  (select 'artist', a.slug::text, a.name, count(*) from plays p join public.artists a on a.id = p.artist_id
   group by a.id order by count(*) desc limit 50)
  union all
  (select 'genre', g.slug::text, g.name_pl || '|' || g.name_en, count(*) from plays p
   join public.release_genres rg on rg.release_id = p.release_id join public.genres g on g.id = rg.genre_id
   group by g.id order by count(*) desc limit 20);
$$;

revoke execute on function private.taste_of(uuid) from public, anon, authenticated;

/**
 * Artists and genres you and `handle` both listen to (last 90 days) and how close your artists are
 * (0..1, shared over all). Null when their stats are not visible to you.
 */
create function public.common_ground(handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  them uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select p.id into them from public.profiles p where p.handle = lower(common_ground.handle) and p.deleted_at is null;
  if them is null or them = me or not private.can_view(them, coalesce(
    (select s.stats_visibility from public.profile_settings s where s.user_id = them), 'followers')) then
    return null;
  end if;
  return (
    with mine as (select * from private.taste_of(me)), theirs as (select * from private.taste_of(them))
    select jsonb_build_object(
      'artists', coalesce((select jsonb_agg(jsonb_build_object('slug', m.ref, 'name', m.name) order by m.plays + t.plays desc)
        from mine m join theirs t on t.kind = m.kind and t.ref = m.ref where m.kind = 'artist'), '[]'::jsonb),
      'genres', coalesce((select jsonb_agg(jsonb_build_object('slug', m.ref,
          'name_pl', split_part(m.name, '|', 1), 'name_en', split_part(m.name, '|', 2)) order by m.plays + t.plays desc)
        from mine m join theirs t on t.kind = m.kind and t.ref = m.ref where m.kind = 'genre'), '[]'::jsonb),
      'match', (select case when count(*) = 0 then 0 else
          round(count(*) filter (where n = 2)::numeric / count(*), 2) end
        from (select ref, count(*) as n from (select ref from mine where kind = 'artist'
          union all select ref from theirs where kind = 'artist') x group by ref) y)
    )
  );
end;
$$;

revoke execute on function public.common_ground(text) from public, anon;
grant execute on function public.common_ground(text) to authenticated;

/**
 * A profile's discovery side, each part only when the owner's setting lets the caller see it (null
 * otherwise): score (total and discovery XP, genre spread for the Discovery Score), badges, and the
 * last 30 days in numbers. Works for visitors too (public parts only).
 */
create function public.profile_overview(handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner uuid;
  settings public.profile_settings;
begin
  select p.id into owner from public.profiles p where p.handle = lower(profile_overview.handle) and p.deleted_at is null;
  if owner is null then
    return null;
  end if;
  select * into settings from public.profile_settings s where s.user_id = owner;
  return jsonb_build_object(
    'score', case when private.can_view(owner, coalesce(settings.score_visibility, 'public')) then (
      select jsonb_build_object(
        'xp', coalesce(sum(p.points), 0),
        'discovery_xp', coalesce(sum(p.points) filter (where p.kind in
          ('new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')), 0),
        'genre_spread', coalesce((select jsonb_agg(n) from (
          select count(*)::integer as n from public.discovery_points d
          join public.tracks t on t.id = d.track_id join public.release_genres rg on rg.release_id = t.release_id
          where d.user_id = owner and d.kind = 'new_song' group by rg.genre_id) g), '[]'::jsonb))
      from public.discovery_points p where p.user_id = owner) end,
    'badges', case when private.can_view(owner, coalesce(settings.badges_visibility, 'public')) then (
      select coalesce(jsonb_agg(jsonb_build_object('code', u.code, 'at', u.unlocked_at) order by u.unlocked_at desc), '[]'::jsonb)
      from public.user_achievements u where u.user_id = owner) end,
    'stats', case when private.can_view(owner, coalesce(settings.stats_visibility, 'followers')) then (
      select jsonb_build_object(
        'listening_ms', coalesce(sum(d.ms_played), 0),
        'active_days', count(*) filter (where d.plays > 0),
        'new_artists', (select count(*) from public.discovery_points p where p.user_id = owner
          and p.kind = 'new_artist' and p.created_at > now() - interval '30 days'),
        'new_songs', (select count(*) from public.discovery_points p where p.user_id = owner
          and p.kind = 'new_song' and p.created_at > now() - interval '30 days'))
      from public.listening_daily d where d.user_id = owner and d.day > current_date - 30) end,
    -- The latest finished Replay (stored ones only: a running year is computed for its owner).
    'replay', case when private.can_view(owner, coalesce(settings.replay_visibility, 'followers')) then (
      select jsonb_build_object('year', r.year,
        'minutes', round((r.data->'stats'->>'listening_ms')::numeric / 60000),
        'top_artist', r.data->'stats'->'top_artists'->0,
        'new_artists', (r.data->'stats'->>'new_artists')::integer)
      from public.listening_replays r where r.user_id = owner order by r.year desc limit 1) end
  );
end;
$$;

revoke execute on function public.profile_overview(text) from public;
grant execute on function public.profile_overview(text) to anon, authenticated;
