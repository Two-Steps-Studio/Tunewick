-- Library (M5.1, docs/database.md §3.6): likes and follows. Rows are private to their owner;
-- only public music can be liked or followed; the follower count is the one public number,
-- and it is a real count.

create table public.track_likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create table public.release_likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, release_id)
);

create table public.artist_follows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create index track_likes_recent_idx on public.track_likes (user_id, created_at desc);
create index release_likes_recent_idx on public.release_likes (user_id, created_at desc);
create index artist_follows_recent_idx on public.artist_follows (user_id, created_at desc);
create index artist_follows_artist_idx on public.artist_follows (artist_id);

alter table public.track_likes enable row level security;
alter table public.release_likes enable row level security;
alter table public.artist_follows enable row level security;

create policy track_likes_own_read on public.track_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy track_likes_own_insert on public.track_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.release_is_public((select t.release_id from public.tracks t where t.id = track_id))
  );
create policy track_likes_own_delete on public.track_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy release_likes_own_read on public.release_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy release_likes_own_insert on public.release_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.release_is_public(release_id));
create policy release_likes_own_delete on public.release_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy artist_follows_own_read on public.artist_follows for select to authenticated
  using (user_id = (select auth.uid()));
create policy artist_follows_own_insert on public.artist_follows for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.artists a where a.id = artist_id and a.status = 'active')
  );
create policy artist_follows_own_delete on public.artist_follows for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.track_likes, public.release_likes, public.artist_follows from anon, authenticated;
grant select, delete on public.track_likes, public.release_likes, public.artist_follows to authenticated;
grant insert (track_id) on public.track_likes to authenticated;
grant insert (release_id) on public.release_likes to authenticated;
grant insert (artist_id) on public.artist_follows to authenticated;

/** How many accounts follow an artist — a real count, never padded; who follows stays private. */
create function public.artist_follower_count(artist uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.artist_follows f
  join public.artists a on a.id = f.artist_id and a.status = 'active'
  where f.artist_id = artist;
$$;

revoke execute on function public.artist_follower_count(uuid) from public;
grant execute on function public.artist_follower_count(uuid) to anon, authenticated;
