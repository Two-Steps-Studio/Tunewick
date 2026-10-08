-- People following people, activity visibility and blocking (M8.2, product.md §4.5).
-- Activity (events marked "Byłem przy tym", public playlists) is shown on a profile according to
-- profile_settings.activity_visibility (default: followers). A block works both ways: neither
-- side can follow the other or see the other's activity, and existing follows end.

create table public.user_follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_not_self check (follower_id <> followee_id)
);

create index user_follows_followee_idx on public.user_follows (followee_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

/** True when either person has blocked the other. */
create function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

/** Whether the signed-in person (or an anonymous visitor) may see `owner`'s activity. */
create function private.can_view_activity(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) = owner then true
    when (select auth.uid()) is not null and private.is_blocked_between((select auth.uid()), owner) then false
    else coalesce((
      select case s.activity_visibility
        when 'public' then true
        when 'followers' then exists (
          select 1 from public.user_follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = owner)
        else false
      end
      from public.profile_settings s where s.user_id = owner), false)
  end;
$$;

revoke execute on function private.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_view_activity(uuid) from public, anon, authenticated;

-- Follows: you see whom you follow and who follows you; you add and remove only your own.
alter table public.user_follows enable row level security;
create policy user_follows_own_read on public.user_follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy user_follows_own_insert on public.user_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not private.is_blocked_between(follower_id, followee_id)
  );
create policy user_follows_own_delete on public.user_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Blocks: private to the person who blocks.
alter table public.user_blocks enable row level security;
create policy user_blocks_own_read on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy user_blocks_own_insert on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy user_blocks_own_delete on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on public.user_follows, public.user_blocks from anon, authenticated;
grant select, delete on public.user_follows, public.user_blocks to authenticated;
grant insert (followee_id) on public.user_follows to authenticated;
grant insert (blocked_id) on public.user_blocks to authenticated;

-- The insert policy calls this helper as the signed-in role (like private.playlist_count).
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;

/** A block ends follows in both directions. */
create function private.end_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_follows f
  where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return new;
end;
$$;

create trigger user_blocks_end_follows
  after insert on public.user_blocks
  for each row execute function private.end_follows_on_block();

/**
 * How a profile relates to the signed-in person: real follower/following counts, whether you
 * follow them, whether you blocked them, and whether their activity is visible to you.
 */
create function public.profile_relationship(profile uuid)
returns table (
  followers integer,
  following integer,
  i_follow boolean,
  i_blocked boolean,
  activity_visible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.user_follows f where f.followee_id = profile),
    (select count(*)::integer from public.user_follows f where f.follower_id = profile),
    exists (select 1 from public.user_follows f
            where f.follower_id = (select auth.uid()) and f.followee_id = profile),
    exists (select 1 from public.user_blocks b
            where b.blocker_id = (select auth.uid()) and b.blocked_id = profile),
    private.can_view_activity(profile)
  from public.profiles p
  where p.id = profile and p.deleted_at is null;
$$;

/** Events a person marked "Byłem przy tym" — only when their activity is visible to you. */
create function public.profile_attended_events(profile uuid)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  venue_name text,
  venue_city text,
  marked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, v.name, v.city, a.created_at
  from public.event_attendance a
  join public.events e on e.id = a.event_id and e.status = 'published'
  join public.venues v on v.id = e.venue_id
  where a.user_id = profile and private.can_view_activity(profile)
  order by e.starts_at desc
  limit 50;
$$;

/** Public playlists of a person — part of their activity, same visibility rule. */
create function public.profile_playlists(profile uuid)
returns table (id uuid, title text, track_count integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title,
    (select count(*)::integer from public.playlist_tracks t where t.playlist_id = p.id),
    p.updated_at
  from public.playlists p
  where p.owner_id = profile and p.visibility = 'public' and private.can_view_activity(profile)
  order by p.updated_at desc
  limit 50;
$$;

/** People the signed-in person has blocked, for the settings page. */
create function public.my_blocked_users()
returns table (id uuid, handle text, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle::text, p.display_name, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke execute on function public.profile_relationship(uuid) from public;
revoke execute on function public.profile_attended_events(uuid) from public;
revoke execute on function public.profile_playlists(uuid) from public;
revoke execute on function public.my_blocked_users() from public, anon;
grant execute on function public.profile_relationship(uuid) to anon, authenticated;
grant execute on function public.profile_attended_events(uuid) to anon, authenticated;
grant execute on function public.profile_playlists(uuid) to anon, authenticated;
grant execute on function public.my_blocked_users() to authenticated;
