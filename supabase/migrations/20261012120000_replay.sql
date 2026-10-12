-- M14.7 TuneWick Replay (docs/discovery-v2.md M14.7).
--
-- A listener's year: the statistics of the year (private.listening_stats) plus the listening of each
-- month, the first song of the year and the same totals for the year before. A finished year is
-- stored once; the running year is computed live ("so far").

create table public.listening_replays (
  user_id uuid not null references auth.users (id) on delete cascade,
  year integer not null check (year between 2000 and 2999),
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.listening_replays enable row level security;
create policy "listening replays own" on public.listening_replays
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.listening_replays from anon, authenticated;
grant select on public.listening_replays to authenticated;

create function private.replay(listener uuid, replay_year integer, until date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select make_date(replay_year, 1, 1) as starts,
      least(make_date(replay_year + 1, 1, 1), until) as ends,
      make_date(replay_year - 1, 1, 1) as prev_starts,
      -- The same stretch of the year before, so a running year compares like with like.
      (least(make_date(replay_year + 1, 1, 1), until) - interval '1 year')::date as prev_ends,
      private.listener_tz(listener) as tz
  )
  select jsonb_build_object(
    'year', replay_year,
    'complete', b.ends = make_date(replay_year + 1, 1, 1),
    'stats', private.listening_stats(listener, b.starts, b.ends),
    'months', (
      select jsonb_agg(jsonb_build_object('month', m, 'ms', coalesce(x.ms, 0)) order by m)
      from generate_series(1, 12) m
      left join (
        select extract(month from d.day)::integer as month, sum(d.ms_played)::bigint as ms
        from public.listening_daily d
        where d.user_id = listener and d.day >= b.starts and d.day < b.ends
        group by 1
      ) x on x.month = m),
    'first_song', (
      select jsonb_build_object('title', t.title, 'code', t.public_code, 'artist', a.name,
        'artist_slug', a.slug, 'artwork_image_id', r.artwork_image_id,
        'at', (e.started_at at time zone b.tz)::date)
      from public.listening_events e
      join public.tracks t on t.id = e.track_id join public.releases r on r.id = t.release_id
      join public.artists a on a.id = e.artist_id
      where e.user_id = listener and not e.soundcheck and (e.ms_played >= 30000 or e.completed)
        and e.started_at >= b.starts::timestamp at time zone b.tz
        and e.started_at < b.ends::timestamp at time zone b.tz
      order by e.started_at limit 1),
    'previous', case when b.prev_ends > b.prev_starts then (
      select jsonb_build_object(
        'listening_ms', coalesce(sum(d.ms_played), 0),
        'active_days', count(*) filter (where d.plays > 0),
        'new_artists', (select count(*) from public.discovery_points p
          where p.user_id = listener and p.kind = 'new_artist'
            and p.created_at >= b.prev_starts::timestamp at time zone b.tz
            and p.created_at < b.prev_ends::timestamp at time zone b.tz),
        'discovery_xp', (select coalesce(sum(p.points), 0) from public.discovery_points p
          where p.user_id = listener and p.kind in
            ('new_song', 'new_artist', 'new_genre', 'new_country', 'full_listen', 'underground')
            and p.created_at >= b.prev_starts::timestamp at time zone b.tz
            and p.created_at < b.prev_ends::timestamp at time zone b.tz))
      from public.listening_daily d
      where d.user_id = listener and d.day >= b.prev_starts and d.day < b.prev_ends)
    end
  )
  from bounds b;
$$;

revoke execute on function private.replay(uuid, integer, date) from public, anon, authenticated;

/** The caller's Replay for a year; null before they joined or in the future. */
create function public.my_replay(replay_year integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  listener uuid := (select auth.uid());
  today date;
  joined integer;
  result jsonb;
begin
  if listener is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  today := (now() at time zone private.listener_tz(listener))::date;
  select extract(year from u.created_at at time zone private.listener_tz(listener))::integer
  into joined from auth.users u where u.id = listener;
  if replay_year > extract(year from today) or replay_year < joined then
    return null;
  end if;

  select r.data into result from public.listening_replays r
  where r.user_id = listener and r.year = replay_year;
  if result is not null then
    return result;
  end if;

  result := private.replay(listener, replay_year, today + 1);
  -- Stored from 2 January: late listens of 31 December are in by then.
  if make_date(replay_year + 1, 1, 1) < today then
    insert into public.listening_replays (user_id, year, data)
    values (listener, replay_year, result)
    on conflict (user_id, year) do nothing;
  end if;
  return result;
end;
$$;

revoke execute on function public.my_replay(integer) from public, anon;
grant execute on function public.my_replay(integer) to authenticated;
