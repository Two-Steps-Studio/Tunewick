-- Share clips (docs/discovery-expansion.md "Video clips"): a 9:16 MP4 of a song's share card with
-- its preview audio and a progress bar — what Stories, Reels, TikTok and Shorts take. The app
-- renders the card into the ingest bucket, the worker muxes it with the preview from the 'high'
-- AAC variant (ffmpeg) into the media bucket. One clip per track, window, language and card design,
-- shared by everyone who asks; only signed-in listeners can start a new one (10 an hour).

create type public.share_clip_status as enum ('awaiting_card', 'queued', 'processing', 'ready', 'failed');

create table public.share_clips (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  locale text not null constraint share_clips_locale check (locale ~ '^[a-z]{2}$'),
  start_ms integer not null constraint share_clips_start check (start_ms >= 0),
  duration_ms integer not null constraint share_clips_duration check (duration_ms between 5000 and 30000),
  -- The card layout version: a new design makes new clips instead of serving old ones.
  design smallint not null constraint share_clips_design check (design between 1 and 1000),
  status public.share_clip_status not null default 'awaiting_card',
  requested_by uuid references auth.users (id) on delete set null,
  card_key text not null,
  object_key text,
  bytes bigint,
  attempts integer not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (track_id, locale, start_ms, duration_ms, design)
);

create index share_clips_queue_idx on public.share_clips (created_at) where status in ('queued', 'processing');
create index share_clips_requester_idx on public.share_clips (requested_by, created_at);

-- Only through the functions below.
alter table public.share_clips enable row level security;
revoke all on public.share_clips from anon, authenticated;

/**
 * Finds or starts the clip of a public track's preview window. needs_card = the caller must render
 * the card into card_key and then call queue_share_clip (also when an earlier caller never did).
 */
create function public.request_share_clip(
  track uuid,
  locale text,
  start_ms integer,
  duration_ms integer,
  design smallint
)
returns table (id uuid, status public.share_clip_status, card_key text, needs_card boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  t record;
  clip public.share_clips;
begin
  if caller is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select tr.id, tr.duration_ms, tr.release_id into t from public.tracks tr where tr.id = request_share_clip.track;
  if t.id is null or not public.release_is_public(t.release_id) then
    raise exception 'not a public track' using errcode = '42501';
  end if;
  if request_share_clip.locale !~ '^[a-z]{2}$'
    or request_share_clip.start_ms < 0
    or request_share_clip.duration_ms not between 5000 and 30000
    or (t.duration_ms is not null and request_share_clip.start_ms + request_share_clip.duration_ms > t.duration_ms) then
    raise exception 'invalid clip window' using errcode = '22023';
  end if;

  select * into clip from public.share_clips c
  where c.track_id = t.id and c.locale = request_share_clip.locale
    and c.start_ms = request_share_clip.start_ms and c.duration_ms = request_share_clip.duration_ms
    and c.design = request_share_clip.design;

  if clip.id is null then
    if (select count(*) from public.share_clips c
        where c.requested_by = caller and c.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'too many clips' using errcode = '54000';
    end if;
    clip.id := gen_random_uuid();
    insert into public.share_clips (id, track_id, locale, start_ms, duration_ms, design, requested_by, card_key)
    values (clip.id, t.id, request_share_clip.locale, request_share_clip.start_ms,
      request_share_clip.duration_ms, request_share_clip.design, caller, 'clips/' || clip.id || '/card.png')
    returning * into clip;
    return query select clip.id, clip.status, clip.card_key, true;
    return;
  end if;

  -- A failed clip is tried again from the start; a card that never arrived is asked for again.
  if clip.status = 'failed' then
    update public.share_clips c set status = 'awaiting_card', attempts = 0, requested_by = caller,
      created_at = now(), finished_at = null
    where c.id = clip.id
    returning * into clip;
  end if;
  return query select clip.id, clip.status, clip.card_key, clip.status = 'awaiting_card';
end;
$$;

/** The card is in place: the worker may render the clip. */
create function public.queue_share_clip(clip uuid)
returns public.share_clip_status
language sql
volatile
security definer
set search_path = ''
as $$
  update public.share_clips c set status = 'queued'
  where c.id = queue_share_clip.clip and c.status = 'awaiting_card' and (select auth.uid()) is not null
  returning c.status;
$$;

/** A clip's state; ready clips also give the media key. Public tracks only. */
create function public.share_clip(clip uuid)
returns table (status public.share_clip_status, object_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, case when c.status = 'ready' then c.object_key end
  from public.share_clips c
  join public.tracks t on t.id = c.track_id
  where c.id = share_clip.clip and public.release_is_public(t.release_id);
$$;

-- ---------------------------------------------------------------------------
-- Worker queue (service role)
-- ---------------------------------------------------------------------------

/** Takes the oldest queued clip (or one stuck for 10 minutes) with the audio to cut it from. */
create function public.claim_share_clip()
returns table (id uuid, track_id uuid, card_key text, audio_key text, start_ms integer, duration_ms integer, attempts integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.share_clips c
  set status = 'failed', finished_at = now()
  where c.status = 'processing' and c.claimed_at < now() - interval '10 minutes' and c.attempts >= 3;

  return query
  with claimed as (
    update public.share_clips c
    set status = 'processing', claimed_at = now(), attempts = c.attempts + 1
    where c.id = (
      select q.id from public.share_clips q
      where q.status = 'queued'
         or (q.status = 'processing' and q.claimed_at < now() - interval '10 minutes')
      order by q.created_at
      for update skip locked
      limit 1
    )
    returning c.*
  )
  select c.id, c.track_id, c.card_key,
    (select v.object_key from public.track_audio_uploads u
      join public.track_audio_variants v on v.upload_id = u.id and v.codec = 'aac_lc'
      where u.track_id = c.track_id and u.status = 'accepted'
      order by u.created_at desc, (v.tier = 'high') desc
      limit 1),
    c.start_ms, c.duration_ms, c.attempts
  from claimed c;
end;
$$;

/** The rendered clip (or null when it cannot be made, e.g. no audio: failed for good). */
create function public.finish_share_clip(clip uuid, object_key text, bytes bigint)
returns public.share_clip_status
language sql
volatile
security definer
set search_path = ''
as $$
  update public.share_clips c
  set status = case when finish_share_clip.object_key is null then 'failed' else 'ready' end::public.share_clip_status,
    object_key = finish_share_clip.object_key,
    bytes = finish_share_clip.bytes,
    finished_at = now()
  where c.id = finish_share_clip.clip and c.status = 'processing'
  returning c.status;
$$;

/** Rendering crashed: back to the queue, failed after the third attempt. */
create function public.fail_share_clip(clip uuid)
returns public.share_clip_status
language sql
volatile
security definer
set search_path = ''
as $$
  update public.share_clips c
  set status = case when c.attempts >= 3 then 'failed' else 'queued' end::public.share_clip_status,
    finished_at = case when c.attempts >= 3 then now() end
  where c.id = fail_share_clip.clip and c.status = 'processing'
  returning c.status;
$$;

revoke execute on function
  public.request_share_clip(uuid, text, integer, integer, smallint),
  public.queue_share_clip(uuid),
  public.share_clip(uuid),
  public.claim_share_clip(),
  public.finish_share_clip(uuid, text, bigint),
  public.fail_share_clip(uuid)
from public, anon, authenticated;

grant execute on function
  public.request_share_clip(uuid, text, integer, integer, smallint),
  public.queue_share_clip(uuid)
to authenticated;
grant execute on function public.share_clip(uuid) to anon, authenticated;
grant execute on function
  public.claim_share_clip(),
  public.finish_share_clip(uuid, text, bigint),
  public.fail_share_clip(uuid)
to service_role;

/** Data export: the clips the caller asked for (the requester is kept only for the hourly limit). */
create function public.my_share_clips()
returns table (track_id uuid, locale text, start_ms integer, duration_ms integer, status public.share_clip_status, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.track_id, c.locale, c.start_ms, c.duration_ms, c.status, c.created_at
  from public.share_clips c
  where c.requested_by = (select auth.uid())
  order by c.created_at;
$$;

revoke execute on function public.my_share_clips() from public, anon;
grant execute on function public.my_share_clips() to authenticated;
