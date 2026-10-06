-- Master audio uploads (M3.2a, docs/audio.md §2).
--
-- The browser uploads the master straight to the ingest bucket (R2) with a presigned URL; this
-- table tracks each upload. Members of the release's artist can read the rows; every write goes
-- through the functions below (members) or the audio worker (service role, M3.2b), so status and
-- results can never be set by a client.

create type public.audio_upload_status as enum (
  'pending',    -- row created, presigned URL handed out, bytes not confirmed yet
  'uploaded',   -- object confirmed in storage, waiting for the worker
  'processing', -- worker is validating/transcoding
  'accepted',   -- worker report: accepted, variants produced
  'rejected',   -- worker report: rejected (reason for the artist)
  'failed'      -- upload never completed or processing crashed
);

create table public.track_audio_uploads (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  object_key text not null unique,
  file_name text not null
    constraint track_audio_uploads_file_name check (char_length(file_name) between 1 and 255),
  size_bytes bigint not null
    -- 1 KiB … 4 GiB (a 4 h 24/192 stereo FLAC is ~ 4 GB; WAV of that would be larger and is rejected)
    constraint track_audio_uploads_size check (size_bytes between 1024 and 4294967296),
  status public.audio_upload_status not null default 'pending',
  rejection_code text,
  rejection_message text,
  -- Full worker report (services/audio-worker); set only by the worker.
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_at timestamptz,
  processed_at timestamptz
);

create index track_audio_uploads_track_idx on public.track_audio_uploads (track_id, created_at desc);
-- The worker's queue.
create index track_audio_uploads_queue_idx on public.track_audio_uploads (uploaded_at)
  where status = 'uploaded';

create trigger track_audio_uploads_set_updated_at
  before update on public.track_audio_uploads
  for each row execute function private.set_updated_at();

alter table public.track_audio_uploads enable row level security;

create policy "track_audio_uploads: members and staff read"
  on public.track_audio_uploads for select to authenticated
  using (
    exists (
      select 1 from public.tracks t
      join public.releases r on r.id = t.release_id
      where t.id = track_id and (public.is_artist_member(r.artist_id) or public.is_staff())
    )
  );

revoke all on public.track_audio_uploads from anon, authenticated;
grant select on public.track_audio_uploads to authenticated;

-- ---------------------------------------------------------------------------
-- Member functions
-- ---------------------------------------------------------------------------

/**
 * Starts an upload for a track of an editable release. Only lossless file types are accepted
 * (decision 2026-10-05); the worker verifies the actual content later. Returns the row with the
 * object key the server presigns.
 */
create function public.begin_audio_upload(track uuid, file_name text, size_bytes bigint)
returns public.track_audio_uploads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  artist uuid;
  release uuid;
  extension text;
  new_id uuid := gen_random_uuid();
  upload public.track_audio_uploads;
begin
  select r.artist_id, r.id into artist, release
  from public.tracks t join public.releases r on r.id = t.release_id
  where t.id = begin_audio_upload.track;

  if release is null or not public.can_edit_release(release) then
    raise exception 'not allowed to upload audio for this track' using errcode = '42501';
  end if;

  extension := lower(substring(btrim(begin_audio_upload.file_name) from '\.([A-Za-z0-9]{2,5})$'));
  if extension is null
     or extension not in ('wav', 'wave', 'bwf', 'rf64', 'aif', 'aiff', 'aifc', 'flac', 'm4a') then
    raise exception 'only lossless masters (WAV, AIFF, FLAC, ALAC) are accepted'
      using errcode = '22023';
  end if;

  -- Abuse guard: a handful of attempts per track per hour is plenty for real re-uploads.
  if (
    select count(*) from public.track_audio_uploads u
    where u.track_id = begin_audio_upload.track and u.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'too many uploads for this track, try again later' using errcode = '54000';
  end if;

  insert into public.track_audio_uploads (id, track_id, uploaded_by, object_key, file_name, size_bytes)
  values (
    new_id,
    begin_audio_upload.track,
    (select auth.uid()),
    format('masters/%s/%s/%s.%s', artist, begin_audio_upload.track, new_id, extension),
    btrim(begin_audio_upload.file_name),
    begin_audio_upload.size_bytes
  )
  returning * into upload;
  return upload;
end;
$$;

/** The uploader confirms the bytes are in storage (the server checked the object first). */
create function public.complete_audio_upload(upload uuid)
returns public.track_audio_uploads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.track_audio_uploads;
begin
  update public.track_audio_uploads u
  set status = 'uploaded', uploaded_at = now()
  where u.id = complete_audio_upload.upload
    and u.status = 'pending'
    and u.uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.tracks t
      where t.id = u.track_id and public.can_edit_release(t.release_id)
    )
  returning * into result;

  if result.id is null then
    raise exception 'upload not found or not pending' using errcode = '42501';
  end if;
  return result;
end;
$$;

/** The uploader gives up on a pending upload (failed transfer, size mismatch). */
create function public.abandon_audio_upload(upload uuid, reason text default 'upload_incomplete')
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.track_audio_uploads u
  set status = 'failed',
      rejection_code = left(abandon_audio_upload.reason, 64)
  where u.id = abandon_audio_upload.upload
    and u.status = 'pending'
    and u.uploaded_by = (select auth.uid());
$$;

revoke execute on function
  public.begin_audio_upload(uuid, text, bigint),
  public.complete_audio_upload(uuid),
  public.abandon_audio_upload(uuid, text)
from public, anon;

grant execute on function
  public.begin_audio_upload(uuid, text, bigint),
  public.complete_audio_upload(uuid),
  public.abandon_audio_upload(uuid, text)
to authenticated;
