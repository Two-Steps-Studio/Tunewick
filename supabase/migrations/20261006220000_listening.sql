-- Listening history (M5.3, docs/database.md §3.6). One row per listen, written only by
-- record_listen() with server-side checks; partitioned by month (partitions live in `private`,
-- never exposed). History is private to the listener, who can clear it at any time. It is the
-- raw input for user-centric payouts later (D2): a play qualifies at ≥ 30 s.

create table public.listening_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  release_id uuid not null,
  artist_id uuid not null,
  started_at timestamptz not null,
  ms_played integer not null constraint listening_events_ms check (ms_played between 1000 and 21600000),
  completed boolean not null default false,
  tier public.quality_tier,
  created_at timestamptz not null default now(),
  primary key (id, started_at)
) partition by range (started_at);

create index listening_events_user_idx on public.listening_events (user_id, started_at desc);
create index listening_events_artist_idx on public.listening_events (artist_id, started_at);

create table private.listening_events_default partition of public.listening_events default;

/** Creates the partition for the month containing `day` (idempotent). Run monthly, ahead. */
create function private.create_listening_partition(day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first date := date_trunc('month', day)::date;
  name text := format('listening_events_%s', to_char(first, 'YYYY_MM'));
begin
  if to_regclass(format('private.%I', name)) is null then
    execute format(
      'create table private.%I partition of public.listening_events for values from (%L) to (%L)',
      name, first, (first + interval '1 month')::date);
  end if;
end;
$$;

revoke execute on function private.create_listening_partition(date) from public, anon, authenticated;

-- This month and the next fourteen; later months fall into the default partition until created.
do $$
begin
  for m in 0..14 loop
    perform private.create_listening_partition((date_trunc('month', now()) + make_interval(months => m))::date);
  end loop;
end;
$$;

alter table public.listening_events enable row level security;

create policy listening_events_read_own on public.listening_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy listening_events_delete_own on public.listening_events for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.listening_events from anon, authenticated;
grant select, delete on public.listening_events to authenticated;

/**
 * Records one listen of a public track by the caller. Refuses what cannot be true: more time than
 * the track lasts (+30 s slack for buffering), a start in the future or more than a day ago,
 * more than 120 listens a minute.
 */
create function public.record_listen(
  track uuid,
  started_at timestamptz,
  ms_played integer,
  completed boolean default false,
  tier public.quality_tier default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  t record;
begin
  if caller is null then
    raise exception 'sign in to keep a history' using errcode = '42501';
  end if;
  select tr.id, tr.duration_ms, r.id as release_id, r.artist_id into t
  from public.tracks tr join public.releases r on r.id = tr.release_id
  where tr.id = track;
  if t.id is null or not public.release_is_public(t.release_id) then
    raise exception 'not a public track' using errcode = '42501';
  end if;
  if ms_played < 1000 or ms_played > coalesce(t.duration_ms + 30000, 21600000) then
    raise exception 'implausible listening time' using errcode = '22023';
  end if;
  if record_listen.started_at > now() + interval '1 minute' or record_listen.started_at < now() - interval '1 day' then
    raise exception 'implausible start time' using errcode = '22023';
  end if;
  if (select count(*) from public.listening_events e
      where e.user_id = caller and e.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many listens' using errcode = '54000';
  end if;
  insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, tier)
  values (caller, track, t.release_id, t.artist_id, record_listen.started_at, record_listen.ms_played,
    coalesce(record_listen.completed, false), record_listen.tier);
end;
$$;

/** The caller's recently played tracks (newest listen first, one row per track). */
create function public.my_recent_tracks(max_results integer default 30)
returns table (track_id uuid, last_played_at timestamptz, plays integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.track_id, max(e.started_at), count(*)::integer
  from public.listening_events e
  where e.user_id = (select auth.uid()) and e.started_at > now() - interval '90 days'
  group by e.track_id
  order by max(e.started_at) desc
  limit least(greatest(max_results, 1), 100);
$$;

revoke execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier) from public, anon;
grant execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier) to authenticated;
revoke execute on function public.my_recent_tracks(integer) from public, anon;
grant execute on function public.my_recent_tracks(integer) to authenticated;
