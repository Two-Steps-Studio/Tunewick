-- Follow people and compare discovery (docs/discovery-expansion.md §3 P2 "Friends comparison").
-- Following is open (like artists); what a person's stats reveal is decided by THEIR
-- profile_settings.activity_visibility: 'public' = anyone signed in may compare, 'followers' =
-- only people they follow themselves (their circle), 'private' = nobody. Counts are public; who follows whom
-- is visible only to the two people involved.

create table public.user_follows (
  follower_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_not_self check (follower_id <> followee_id)
);

create index user_follows_followee_idx on public.user_follows (followee_id);

alter table public.user_follows enable row level security;
create policy user_follows_read_involved on public.user_follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy user_follows_insert_own on public.user_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = followee_id and p.deleted_at is null and p.handle is not null)
  );
create policy user_follows_delete_own on public.user_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

revoke all on public.user_follows from anon, authenticated;
grant select, delete on public.user_follows to authenticated;
grant insert (followee_id) on public.user_follows to authenticated;

/** Public follower / following counts of a profile (real counts; who is private). */
create function public.user_follow_counts(person uuid)
returns table (followers integer, following integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.user_follows f where f.followee_id = person),
    (select count(*)::integer from public.user_follows f where f.follower_id = person);
$$;

revoke execute on function public.user_follow_counts(uuid) from public;
grant execute on function public.user_follow_counts(uuid) to anon, authenticated;

/** May the caller see `person`'s discovery numbers? (their own visibility setting decides) */
create function public.can_compare_with(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and person <> (select auth.uid()) and exists (
    select 1 from public.profile_settings s
    join public.profiles p on p.id = s.user_id and p.deleted_at is null
    where s.user_id = person and (
      s.activity_visibility = 'public'
      or (s.activity_visibility = 'followers'
        and exists (select 1 from public.user_follows f where f.follower_id = person and f.followee_id = (select auth.uid())))
    )
  );
$$;

revoke execute on function public.can_compare_with(uuid) from public, anon;
grant execute on function public.can_compare_with(uuid) to authenticated;

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
 * You vs a friend, by handle, over 7 / 30 days or all time (0). Null when the friend's setting
 * does not allow it — the caller learns nothing about their activity then.
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
  if them is null or not public.can_compare_with(them) then
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
