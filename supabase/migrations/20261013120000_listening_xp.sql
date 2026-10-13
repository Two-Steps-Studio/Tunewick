-- Listening time earns XP too, not only discovering: +10 XP for every 10 minutes listened in a
-- day (the listener's own day), at most 120 XP a day (2 hours). Plays under 30 seconds and
-- soundchecks don't count. It is XP only: the Discovery Score still rewards discovering alone.

alter table public.discovery_point_rules drop constraint discovery_point_rules_kind;
alter table public.discovery_point_rules add constraint discovery_point_rules_kind check (kind in (
  'new_song', 'new_artist', 'new_genre', 'new_country', 'save', 'full_listen', 'share', 'challenge',
  'underground', 'daily_complete', 'weekly_complete', 'listening'
));
insert into public.discovery_point_rules (kind, points, daily_cap) values ('listening', 10, 120);

/** XP for the 10-minute steps the listener has reached today; each step is paid once. */
create function private.award_listening_time(listener uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.listener_tz(listener);
  today date := (now() at time zone tz)::date;
  listened bigint;
  steps integer;
  step integer;
  granted integer;
  awards jsonb := '[]'::jsonb;
begin
  select coalesce(sum(e.ms_played), 0) into listened
  from public.listening_events e
  where e.user_id = listener
    and e.started_at >= today::timestamp at time zone tz
    and not e.soundcheck and e.ms_played >= 30000;
  steps := least(listened / 600000, 12)::integer;
  for step in 1..steps loop
    granted := private.award(listener, 'listening', today::text || ':' || step);
    if granted is not null and granted > 0 then
      awards := awards || jsonb_build_object('kind', 'listening', 'points', granted, 'minutes', step * 10);
    end if;
  end loop;
  return awards;
end;
$$;

revoke execute on function private.award_listening_time(uuid) from public, anon, authenticated;

create or replace function public.record_listen(
  track uuid,
  started_at timestamptz,
  ms_played integer,
  completed boolean default false,
  tier public.quality_tier default null,
  soundcheck boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  t record;
  result jsonb;
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
  if ms_played < 1000 or ms_played > coalesce(t.duration_ms + 30000, 21600000)
    or (record_listen.soundcheck and ms_played > 35000) then
    raise exception 'implausible listening time' using errcode = '22023';
  end if;
  if record_listen.started_at > now() + interval '1 minute' or record_listen.started_at < now() - interval '1 day' then
    raise exception 'implausible start time' using errcode = '22023';
  end if;
  if (select count(*) from public.listening_events e
      where e.user_id = caller and e.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many listens' using errcode = '54000';
  end if;
  insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played,
    completed, tier, soundcheck)
  values (caller, track, t.release_id, t.artist_id, record_listen.started_at, record_listen.ms_played,
    coalesce(record_listen.completed, false), record_listen.tier, coalesce(record_listen.soundcheck, false));
  result := private.award_listen(caller, track, record_listen.ms_played, coalesce(record_listen.completed, false),
    coalesce(record_listen.soundcheck, false));
  if not coalesce(record_listen.soundcheck, false) and record_listen.ms_played >= 30000 then
    result := jsonb_set(result, '{awards}',
      coalesce(result -> 'awards', '[]'::jsonb) || private.award_listening_time(caller));
  end if;
  return result;
end;
$$;
