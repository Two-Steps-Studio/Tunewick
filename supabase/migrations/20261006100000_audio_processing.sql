-- Audio processing results (M3.2b, docs/audio.md §2–§4).
--
-- The audio worker (services/audio-worker) claims uploaded masters, processes them and records the
-- outcome. Everything here is callable only with the service role; artists read the results
-- through RLS.

create type public.quality_tier as enum ('data_saver', 'high', 'lossless', 'hires');

alter table public.track_audio_uploads
  add column attempts integer not null default 0,
  add column claimed_at timestamptz,
  add column duration_ms integer,
  add column integrated_lufs numeric(6, 2),
  add column true_peak_dbtp numeric(6, 2);

create table public.track_audio_variants (
  upload_id uuid not null references public.track_audio_uploads (id) on delete cascade,
  tier public.quality_tier not null,
  codec text not null constraint track_audio_variants_codec check (codec in ('aac_lc', 'flac')),
  container text not null
    constraint track_audio_variants_container check (container in ('flac', 'fmp4')),
  sample_rate integer not null
    constraint track_audio_variants_rate check (sample_rate between 8000 and 384000),
  bit_depth smallint constraint track_audio_variants_bits check (bit_depth in (16, 24)),
  nominal_kbps integer,
  bitrate_kbps integer not null,
  samples bigint not null constraint track_audio_variants_samples check (samples > 0),
  encoder_delay_samples integer not null default 0,
  padding_samples integer not null default 0,
  object_key text not null unique,
  bytes bigint not null constraint track_audio_variants_bytes check (bytes > 0),
  sha256 text not null constraint track_audio_variants_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  primary key (upload_id, tier, container)
);

alter table public.track_audio_variants enable row level security;

/**
 * Variants are visible to members/staff, or to everyone once the release is public. Security
 * definer, because anonymous visitors have no access to track_audio_uploads itself.
 */
create function public.can_view_audio_upload(upload uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.track_audio_uploads u
    join public.tracks t on t.id = u.track_id
    where u.id = upload and public.can_view_release(t.release_id)
  );
$$;

create policy "track_audio_variants: members, staff, or public release"
  on public.track_audio_variants for select to anon, authenticated
  using (public.can_view_audio_upload(upload_id));

revoke all on public.track_audio_variants from anon, authenticated;
grant select on public.track_audio_variants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker functions (service role only)
-- ---------------------------------------------------------------------------

/**
 * Takes the oldest uploaded master (or one whose worker died 30+ minutes ago) and marks it
 * processing. SKIP LOCKED lets several workers run side by side without taking the same job.
 */
create function public.claim_audio_upload()
returns table (id uuid, track_id uuid, object_key text, attempts integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Jobs that keep crashing the worker stop being retried.
  update public.track_audio_uploads u
  set status = 'failed', rejection_code = 'processing_failed'
  where u.status = 'processing'
    and u.claimed_at < now() - interval '30 minutes'
    and u.attempts >= 3;

  return query
  update public.track_audio_uploads u
  set status = 'processing', claimed_at = now(), attempts = u.attempts + 1
  where u.id = (
    select c.id from public.track_audio_uploads c
    where c.status = 'uploaded'
       or (c.status = 'processing' and c.claimed_at < now() - interval '30 minutes')
    order by c.uploaded_at
    for update skip locked
    limit 1
  )
  returning u.id, u.track_id, u.object_key, u.attempts;
end;
$$;

/**
 * Records the worker report. Accepted: the delivery variants (already stored in the media bucket)
 * and the measured duration/loudness; the track's duration comes from the audio from now on.
 * Rejected: the reason code and message for the artist.
 */
create function public.finish_audio_upload(upload uuid, report jsonb, variants jsonb default '[]')
returns public.audio_upload_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current public.track_audio_uploads;
  duration integer;
begin
  select * into current from public.track_audio_uploads u
  where u.id = finish_audio_upload.upload and u.status = 'processing'
  for update;
  if current.id is null then
    raise exception 'upload is not being processed' using errcode = '55000';
  end if;

  if finish_audio_upload.report ->> 'status' = 'accepted' then
    insert into public.track_audio_variants (
      upload_id, tier, codec, container, sample_rate, bit_depth, nominal_kbps, bitrate_kbps,
      samples, encoder_delay_samples, padding_samples, object_key, bytes, sha256
    )
    select current.id, v.tier, v.codec, v.container, v.sample_rate, v.bit_depth, v.nominal_kbps,
      v.bitrate_kbps, v.samples, v.encoder_delay_samples, v.padding_samples, v.object_key,
      v.bytes, v.sha256
    from jsonb_to_recordset(finish_audio_upload.variants) as v (
      tier public.quality_tier, codec text, container text, sample_rate integer,
      bit_depth smallint, nominal_kbps integer, bitrate_kbps integer, samples bigint,
      encoder_delay_samples integer, padding_samples integer, object_key text, bytes bigint,
      sha256 text
    );
    if not found then
      raise exception 'an accepted master needs delivery variants' using errcode = '23514';
    end if;

    duration := round((finish_audio_upload.report -> 'input' ->> 'duration_s')::numeric * 1000);
    update public.track_audio_uploads u
    set status = 'accepted',
        report = finish_audio_upload.report,
        processed_at = now(),
        rejection_code = null,
        rejection_message = null,
        duration_ms = duration,
        integrated_lufs = (finish_audio_upload.report -> 'analysis' -> 'loudness' ->> 'integrated_lufs')::numeric,
        true_peak_dbtp = (finish_audio_upload.report -> 'analysis' -> 'loudness' ->> 'true_peak_dbtp')::numeric
    where u.id = current.id;

    update public.tracks t set duration_ms = duration where t.id = current.track_id;
    return 'accepted'::public.audio_upload_status;
  end if;

  update public.track_audio_uploads u
  set status = 'rejected',
      report = finish_audio_upload.report,
      processed_at = now(),
      rejection_code = left(finish_audio_upload.report -> 'rejection' ->> 'code', 64),
      rejection_message = left(finish_audio_upload.report -> 'rejection' ->> 'message', 500)
  where u.id = current.id;
  return 'rejected'::public.audio_upload_status;
end;
$$;

/** Processing crashed (not a verdict on the file): retry, up to three attempts in total. */
create function public.fail_audio_upload(upload uuid)
returns public.audio_upload_status
language sql
volatile
security definer
set search_path = ''
as $$
  update public.track_audio_uploads u
  set status = case when u.attempts >= 3 then 'failed' else 'uploaded' end::public.audio_upload_status,
      rejection_code = case when u.attempts >= 3 then 'processing_failed' end,
      claimed_at = null
  where u.id = fail_audio_upload.upload and u.status = 'processing'
  returning u.status;
$$;

revoke execute on function
  public.claim_audio_upload(),
  public.finish_audio_upload(uuid, jsonb, jsonb),
  public.fail_audio_upload(uuid)
from public, anon, authenticated;

grant execute on function
  public.claim_audio_upload(),
  public.finish_audio_upload(uuid, jsonb, jsonb),
  public.fail_audio_upload(uuid)
to service_role;
