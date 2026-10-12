-- Wakes the audio worker when there is work (docs/deployment.md §3b).
--
-- On Fly.io the worker stops itself after a few idle minutes (it pays only while it runs); any HTTP
-- request to the app starts it again. New uploads, images, share clips and storage deletions send
-- one such request (at most every 20 seconds); an hourly wake covers retries of crashed jobs and the
-- reanalysis backfill. With no URL configured (local, CI, an always-on worker) nothing is sent.
--
--   update private.worker_wake set url = 'https://<fly-app>.fly.dev/wake';

create extension if not exists pg_net;

create table private.worker_wake (
  id boolean primary key default true check (id),
  url text check (url is null or url ~ '^https://'),
  last_sent_at timestamptz
);
insert into private.worker_wake default values;
revoke all on private.worker_wake from public, anon, authenticated;

/** Sends one wake request unless one went out in the last 20 seconds (or `always`). */
create function private.wake_worker(always boolean default false)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target text;
begin
  update private.worker_wake w
  set last_sent_at = now()
  where w.url is not null
    and (always or w.last_sent_at is null or w.last_sent_at < now() - interval '20 seconds')
  returning w.url into target;
  if target is null then
    return false;
  end if;
  perform net.http_get(url := target, timeout_milliseconds := 10000);
  return true;
end;
$$;

revoke execute on function private.wake_worker(boolean) from public, anon, authenticated;

create function private.wake_worker_on_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.wake_worker();
  return null;
end;
$$;

create trigger track_audio_uploads_wake_worker
  after insert or update of status on public.track_audio_uploads
  for each row when (new.status = 'uploaded')
  execute function private.wake_worker_on_job();

create trigger images_wake_worker
  after insert or update of status on public.images
  for each row when (new.status = 'uploaded')
  execute function private.wake_worker_on_job();

create trigger share_clips_wake_worker
  after insert or update of status on public.share_clips
  for each row when (new.status = 'queued')
  execute function private.wake_worker_on_job();

create trigger storage_deletions_wake_worker
  after insert on private.storage_deletions
  for each statement
  execute function private.wake_worker_on_job();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('worker-wake', '7 * * * *', $cron$select private.wake_worker(true)$cron$);
  end if;
end;
$$;
