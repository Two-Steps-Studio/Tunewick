-- You vs a friend (P2 "Friends comparison", docs/discovery-expansion.md). Built on M8.2: follows,
-- blocks and profile_settings.activity_visibility decide through private.can_view_activity —
-- whoever may see a person's activity may compare discoveries with them; nobody else learns
-- anything.

/** One person's discovery numbers over the last `days` days (0 = all time). */
create function private.discovery_summary(person uuid, days integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select case when days > 0 then now() - make_interval(days => days) else '-infinity'::timestamptz end as t
  ), ev as (
    select e.* from public.listening_events e, since where e.user_id = person and e.started_at >= since.t
  ), dp as (
    select p.* from public.discovery_points p, since where p.user_id = person and p.created_at >= since.t
  )
  select jsonb_build_object(
    'songs', (select count(distinct track_id) from ev),
    'artists', (select count(distinct artist_id) from ev),
    'countries', (select count(distinct a.country_code) from ev join public.artists a on a.id = ev.artist_id where a.country_code is not null),
    'listening_ms', coalesce((select sum(ms_played) from ev), 0),
    'new_artists', (select count(*) from dp where kind = 'new_artist'),
    'points', coalesce((select sum(points) from dp), 0)
  );
$$;

revoke execute on function private.discovery_summary(uuid, integer) from public, anon, authenticated;

/**
 * You vs a friend, by handle, over 7 / 30 days or all time (0). Null when their activity is not
 * visible to you (their setting, or a block either way).
 */
create function public.compare_with(handle text, days integer default 7)
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
  select p.id into them from public.profiles p where p.handle = lower(compare_with.handle) and p.deleted_at is null;
  if them is null or them = me or not private.can_view_activity(them) then
    return null;
  end if;
  return jsonb_build_object(
    'me', private.discovery_summary(me, greatest(days, 0)),
    'them', private.discovery_summary(them, greatest(days, 0))
  );
end;
$$;

revoke execute on function public.compare_with(text, integer) from public, anon;
grant execute on function public.compare_with(text, integer) to authenticated;
