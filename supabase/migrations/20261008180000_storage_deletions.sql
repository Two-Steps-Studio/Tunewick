-- Storage sweep: objects in the ingest/media buckets that nothing refers to any more are deleted
-- by the worker (docs/deployment.md §6). A row here is queued whenever the database forgets an
-- object; the worker deletes it from S3/R2 and then the row (missing objects count as deleted).
-- First user: share clips — removed when their song is no longer public, when nobody asked for
-- them in 90 days (e.g. after the soundcheck changed), or when they never got going.

create table private.storage_deletions (
  id bigint generated always as identity primary key,
  bucket text not null constraint storage_deletions_bucket check (bucket in ('ingest', 'media')),
  object_key text not null constraint storage_deletions_key check (char_length(object_key) between 1 and 512),
  attempts integer not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index storage_deletions_pending_idx on private.storage_deletions (id) where attempts < 5;

create function private.share_clip_objects_forgotten()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_deletions (bucket, object_key) values ('ingest', old.card_key);
  if old.object_key is not null then
    insert into private.storage_deletions (bucket, object_key) values ('media', old.object_key);
  end if;
  return null;
end;
$$;

-- Also covers clips removed with their track (on delete cascade).
create trigger share_clips_objects_forgotten
  after delete on public.share_clips
  for each row execute function private.share_clip_objects_forgotten();

/** Daily: removes clips that are no longer needed (their objects go to the sweep). */
create function private.expire_share_clips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.share_clips c
  using public.tracks t
  where t.id = c.track_id
    and (not public.release_is_public(t.release_id)
      or c.last_requested_at < now() - interval '90 days'
      or (c.status in ('awaiting_card', 'failed') and c.last_requested_at < now() - interval '1 day'));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function private.expire_share_clips() from public, anon, authenticated;

/** Worker: up to max_results objects to delete (a claim lasts 10 minutes; 5 tries at most). */
create function public.claim_storage_deletions(max_results integer default 100)
returns table (id bigint, bucket text, object_key text)
language sql
volatile
security definer
set search_path = ''
as $$
  update private.storage_deletions d
  set attempts = d.attempts + 1, claimed_at = now()
  where d.id in (
    select q.id from private.storage_deletions q
    where q.attempts < 5 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
    order by q.id
    for update skip locked
    limit least(greatest(max_results, 1), 500)
  )
  returning d.id, d.bucket, d.object_key;
$$;

/** Worker: these objects are gone from storage. */
create function public.finish_storage_deletions(ids bigint[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (delete from private.storage_deletions d where d.id = any (ids) returning 1)
  select count(*)::integer from gone;
$$;

revoke execute on function public.claim_storage_deletions(integer), public.finish_storage_deletions(bigint[])
  from public, anon, authenticated;
grant execute on function public.claim_storage_deletions(integer), public.finish_storage_deletions(bigint[])
  to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('share-clips-expiry', '55 3 * * *', 'select private.expire_share_clips()');
  end if;
end;
$$;
