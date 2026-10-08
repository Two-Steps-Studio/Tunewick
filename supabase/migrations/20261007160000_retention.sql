-- Data retention made real (privacy policy §6, database.md §6). A daily pg_cron job removes what
-- the privacy policy says is not kept:
--   raw listening events  older than 25 months (whole monthly partitions are dropped);
--   promo code attempts   older than 90 days;
--   playback telemetry    older than 13 months; hourly rate counters older than 2 days;
--   staff audit log       older than 2 years.
-- Monthly listening shares (D2) are kept: they are the accounting base for payouts.

-- The audit log stays tamper-resistant: no updates ever, and deletes only of entries past the
-- two-year retention (which is what the daily job removes).
create or replace function private.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.created_at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

/** Applies the retention rules; returns what was removed, for the job log. */
create function private.apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff date := (date_trunc('month', now()) - interval '25 months')::date;
  part record;
  dropped integer := 0;
  default_rows integer;
  attempts integer;
  metrics integer;
  counters integer;
  audit integer;
begin
  -- Monthly partitions whose whole month ended before the cutoff.
  for part in
    select c.relname, to_date(right(c.relname, 7), 'YYYY_MM') as month
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_namespace n on n.oid = c.relnamespace
    where i.inhparent = 'public.listening_events'::regclass and n.nspname = 'private'
      and c.relname ~ '^listening_events_[0-9]{4}_[0-9]{2}$'
  loop
    if part.month < cutoff then
      execute format('drop table private.%I', part.relname);
      dropped := dropped + 1;
    end if;
  end loop;
  delete from private.listening_events_default d where d.started_at < cutoff;
  get diagnostics default_rows = row_count;

  delete from private.promo_attempts a where a.attempted_at < now() - interval '90 days';
  get diagnostics attempts = row_count;
  delete from private.playback_metrics m where m.day < (now() - interval '13 months')::date;
  get diagnostics metrics = row_count;
  delete from private.playback_report_counts c where c.hour < now() - interval '2 days';
  get diagnostics counters = row_count;
  delete from private.audit_log l where l.created_at < now() - interval '2 years';
  get diagnostics audit = row_count;

  return jsonb_build_object('listening_partitions', dropped, 'listening_default_rows', default_rows,
    'promo_attempts', attempts, 'playback_metrics', metrics, 'rate_counters', counters, 'audit_log', audit);
end;
$$;

revoke execute on function private.apply_retention() from public, anon, authenticated;

-- 03:45 every day.
select cron.schedule('retention', '45 3 * * *', $$select private.apply_retention()$$);
