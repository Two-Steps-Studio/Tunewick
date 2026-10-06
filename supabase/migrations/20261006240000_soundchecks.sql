-- Soundchecks (M7.4, product.md §6): a ≤ 30 s excerpt chosen by the artist (tracks.soundcheck_*,
-- default: from the start). Soundcheck plays are recorded but flagged, so they never count
-- towards payouts (D2).

alter table public.listening_events add column soundcheck boolean not null default false;

drop function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier);

create function public.record_listen(
  track uuid,
  started_at timestamptz,
  ms_played integer,
  completed boolean default false,
  tier public.quality_tier default null,
  soundcheck boolean default false
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
end;
$$;

revoke execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier, boolean) from public, anon;
grant execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier, boolean) to authenticated;

-- A soundcheck must fit in the track when its length is known.
create function private.check_soundcheck()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.soundcheck_start_ms is not null and new.duration_ms is not null
     and new.soundcheck_start_ms > greatest(new.duration_ms - 5000, 0) then
    -- A new, shorter master (the worker sets the duration) must not fail processing:
    -- the excerpt falls back to the start. A wrong choice by the artist is refused.
    if tg_op = 'UPDATE' and new.soundcheck_start_ms is not distinct from old.soundcheck_start_ms then
      new.soundcheck_start_ms := null;
    else
      raise exception 'the soundcheck starts after the end of the track' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger tracks_check_soundcheck before insert or update of soundcheck_start_ms, duration_ms on public.tracks
  for each row execute function private.check_soundcheck();

/** Soundcheck of each given public release: its first track with a chosen excerpt, else track 1. */
create function public.release_soundchecks(releases uuid[])
returns table (release_id uuid, track_id uuid, title text, start_ms integer, duration_ms integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (t.release_id) t.release_id, t.id, t.title,
    coalesce(t.soundcheck_start_ms, 0),
    least(coalesce(t.soundcheck_duration_ms, 30000), greatest(coalesce(t.duration_ms, 30000) - coalesce(t.soundcheck_start_ms, 0), 1000))
  from public.tracks t
  where t.release_id = any (releases) and public.release_is_public(t.release_id)
  order by t.release_id, (t.soundcheck_start_ms is null), t.disc_number, t.track_number;
$$;

revoke execute on function public.release_soundchecks(uuid[]) from public;
grant execute on function public.release_soundchecks(uuid[]) to anon, authenticated;
