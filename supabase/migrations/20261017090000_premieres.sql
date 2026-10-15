-- Premieres: an approved release with a future date (scheduled by review_release) gets a public
-- page before it is out - cover, title, the date and a countdown, no audio - and listeners can
-- ask to be reminded. A reminder works like a pre-save: when the release goes live it lands in
-- the listener's library (release_likes) and the reminder is removed.

create table public.release_reminders (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, release_id)
);
create index release_reminders_release_idx on public.release_reminders (release_id);

/** True for an approved release whose date is still ahead. */
create function public.release_is_upcoming(release uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.id = release and r.status = 'published' and r.publish_at > now() and a.status = 'active'
  );
$$;

alter table public.release_reminders enable row level security;
create policy release_reminders_own_read on public.release_reminders for select to authenticated
  using (user_id = (select auth.uid()));
create policy release_reminders_own_insert on public.release_reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and public.release_is_upcoming(release_id));
create policy release_reminders_own_delete on public.release_reminders for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.release_reminders from anon, authenticated;
grant select, delete on public.release_reminders to authenticated;
grant insert (release_id) on public.release_reminders to authenticated;

/**
 * Upcoming (scheduled, not yet out) releases - of one artist, or the one with these slugs. Only
 * what the premiere page shows; tracks and audio stay hidden until the date.
 */
create function public.upcoming_releases(artist_slug text default null, release_slug text default null, artist uuid default null)
returns table (
  id uuid,
  slug text,
  title text,
  type public.release_type,
  publish_at timestamptz,
  artwork_image_id uuid,
  artist_id uuid,
  artist_slug text,
  artist_name text,
  verified boolean,
  reminders integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.slug::text, r.title, r.type, r.publish_at, r.artwork_image_id,
    a.id, a.slug::text, a.name, a.verification_status = 'verified',
    (select count(*) from public.release_reminders m where m.release_id = r.id)::integer
  from public.releases r
  join public.artists a on a.id = r.artist_id
  where r.status = 'published' and r.publish_at > now() and a.status = 'active'
    and (upcoming_releases.artist is null or a.id = upcoming_releases.artist)
    and (upcoming_releases.artist_slug is null or a.slug = lower(upcoming_releases.artist_slug))
    and (upcoming_releases.release_slug is null or r.slug = lower(upcoming_releases.release_slug))
  order by r.publish_at
  limit 20;
$$;

revoke execute on function public.release_is_upcoming(uuid) from public;
revoke execute on function public.upcoming_releases(text, text, uuid) from public;
grant execute on function public.release_is_upcoming(uuid) to anon, authenticated;
grant execute on function public.upcoming_releases(text, text, uuid) to anon, authenticated;

/** Releases that went live: their reminders become library entries. */
create function private.deliver_release_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivered integer;
begin
  with due as (
    delete from public.release_reminders m
    using public.releases r
    where r.id = m.release_id and r.status = 'published' and r.publish_at <= now()
    returning m.user_id, m.release_id
  )
  insert into public.release_likes (user_id, release_id)
  select user_id, release_id from due
  on conflict do nothing;
  get diagnostics delivered = row_count;
  return delivered;
end;
$$;

revoke execute on function private.deliver_release_reminders() from public, anon, authenticated;

-- Every 10 minutes; releases go live at midnight in Poland, so reminders land within minutes.
select cron.schedule('release-reminders', '*/10 * * * *',
  $$select private.deliver_release_reminders()$$);
