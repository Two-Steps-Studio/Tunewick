-- Why processing failed, where the owner can see it (Admin → Processing) instead of only in the
-- worker's logs on the server. The worker reports the error text before it gives the job back;
-- entries are kept for 30 days.

create table private.worker_errors (
  id bigint generated always as identity primary key,
  kind text not null constraint worker_errors_kind check (kind in ('audio', 'image', 'clip', 'reanalysis')),
  subject uuid,
  message text not null constraint worker_errors_message check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);
create index worker_errors_created_idx on private.worker_errors (created_at desc);

/** Called by the audio worker (service role) when a job crashed; trims entries older than 30 days. */
create function public.report_worker_error(kind text, subject uuid, message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.worker_errors (kind, subject, message)
  values (report_worker_error.kind, report_worker_error.subject, left(coalesce(report_worker_error.message, ''), 500));
  delete from private.worker_errors where created_at < now() - interval '30 days';
end;
$$;

revoke execute on function public.report_worker_error(text, uuid, text) from public, anon, authenticated;
grant execute on function public.report_worker_error(text, uuid, text) to service_role;

/**
 * Health of file processing for the admin panel: what waits, since when, and the latest errors.
 * A queue that only grows means the worker is down or cannot reach storage.
 */
create function public.admin_media_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return jsonb_build_object(
    'audio', jsonb_build_object(
      'waiting', (select count(*) from public.track_audio_uploads where status = 'uploaded'),
      'processing', (select count(*) from public.track_audio_uploads where status = 'processing'),
      'oldest_waiting_at', (select min(uploaded_at) from public.track_audio_uploads where status = 'uploaded')
    ),
    'images', jsonb_build_object(
      'waiting', (select count(*) from public.images where status = 'uploaded'),
      'processing', (select count(*) from public.images where status = 'processing'),
      'oldest_waiting_at', (select min(uploaded_at) from public.images where status = 'uploaded')
    ),
    'errors_24h', (select count(*) from private.worker_errors where created_at > now() - interval '24 hours'),
    'recent_errors', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'message', e.message, 'at', e.created_at)
        order by e.created_at desc)
      from (select * from private.worker_errors order by created_at desc limit 5) e
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_media_health() from public, anon;
grant execute on function public.admin_media_health() to authenticated;
