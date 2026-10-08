-- Backfill for worker report v2 (docs/audio.md §2.6): masters processed before it have no best
-- moment or waveform. The worker re-analyses them from their delivery variants (lossless FLAC when
-- there is one, else the AAC) — masters may be gone from the ingest bucket — whenever it has
-- nothing else to do, newest first, and merges the two fields into the stored report.

alter table public.track_audio_uploads
  add column reanalysis_attempts smallint not null default 0,
  add column reanalysis_claimed_at timestamptz;

create index track_audio_uploads_reanalysis_idx on public.track_audio_uploads (created_at desc)
  where status = 'accepted';

/** Worker: the newest accepted upload with a report before v2 and the variant to analyse. */
create function public.claim_audio_reanalysis()
returns table (id uuid, object_key text, codec text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with claimed as (
    update public.track_audio_uploads u
    set reanalysis_attempts = u.reanalysis_attempts + 1, reanalysis_claimed_at = now()
    where u.id = (
      select q.id from public.track_audio_uploads q
      where q.status = 'accepted'
        and coalesce((q.report ->> 'version')::integer, 1) < 2
        and q.reanalysis_attempts < 3
        and (q.reanalysis_claimed_at is null or q.reanalysis_claimed_at < now() - interval '15 minutes')
        and exists (select 1 from public.track_audio_variants v where v.upload_id = q.id)
      order by q.created_at desc
      for update skip locked
      limit 1
    )
    returning u.id
  )
  select c.id, v.object_key, v.codec
  from claimed c
  join lateral (
    select x.object_key, x.codec from public.track_audio_variants x
    where x.upload_id = c.id
    order by (x.codec = 'flac') desc, (x.tier = 'high') desc
    limit 1
  ) v on true;
end;
$$;

/** Worker: merges the new analysis into the report (now v2). */
create function public.finish_audio_reanalysis(upload uuid, best_moment jsonb, waveform jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(best_moment -> 'start_ms') <> 'number' or jsonb_typeof(waveform) <> 'array'
     or jsonb_array_length(waveform) > 400 then
    raise exception 'invalid analysis' using errcode = '22023';
  end if;
  update public.track_audio_uploads u
  set report = u.report || jsonb_build_object(
        'version', 2,
        'analysis', coalesce(u.report -> 'analysis', '{}'::jsonb)
          || jsonb_build_object('best_moment', best_moment, 'waveform', waveform)),
      reanalysis_claimed_at = null
  where u.id = finish_audio_reanalysis.upload and u.status = 'accepted';
  return found;
end;
$$;

revoke execute on function public.claim_audio_reanalysis(), public.finish_audio_reanalysis(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_audio_reanalysis(), public.finish_audio_reanalysis(uuid, jsonb, jsonb)
  to service_role;
