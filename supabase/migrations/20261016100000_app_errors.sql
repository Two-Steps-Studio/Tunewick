-- Error reports from the app (server render errors, browser errors), so problems are seen before
-- listeners give up. Grouped, not logged: one row per error fingerprint and day with a counter,
-- and at most 500 different errors a day, so a flood (or someone posting junk) cannot grow the
-- table. Nothing about the person is stored: no user id, no IP, the path without its query.
-- Kept 30 days.
create table private.app_errors (
  fingerprint text not null,
  day date not null default current_date,
  source text not null constraint app_errors_source check (source in ('server', 'client')),
  message text not null,
  detail text,
  path text,
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (fingerprint, day)
);

create function public.report_error(
  source text,
  message text,
  detail text default null,
  path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := left(coalesce(nullif(trim(report_error.message), ''), '(no message)'), 300);
  info text := left(report_error.detail, 2000);
  place text := left(split_part(coalesce(report_error.path, ''), '?', 1), 200);
  -- Same error = same source, message and first stack line (line numbers change per deploy, so
  -- digits are dropped).
  fp text := md5(report_error.source || '|' || regexp_replace(msg || '|' ||
    coalesce(split_part(info, E'\n', 2), ''), '[0-9]+', '', 'g'));
begin
  if report_error.source not in ('server', 'client') then
    raise exception 'invalid error report' using errcode = '22023';
  end if;
  update private.app_errors e set count = least(e.count + 1, 1000000), last_seen = now()
  where e.fingerprint = fp and e.day = current_date;
  if found then return; end if;
  if (select count(*) from private.app_errors e where e.day = current_date) >= 500 then
    return; -- quietly drop: reporting must never get in the way
  end if;
  insert into private.app_errors (fingerprint, source, message, detail, path)
  values (fp, report_error.source, msg, info, nullif(place, ''))
  on conflict (fingerprint, day) do update set count = least(private.app_errors.count + 1, 1000000),
    last_seen = now();
end;
$$;

/** The most frequent errors of the last `days` days (admin + aal2). */
create function public.admin_app_errors(days integer default 7)
returns table (
  source text,
  message text,
  detail text,
  path text,
  occurrences bigint,
  last_seen timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
  select (array_agg(e.source order by e.last_seen desc))[1],
    (array_agg(e.message order by e.last_seen desc))[1],
    (array_agg(e.detail order by e.last_seen desc))[1],
    (array_agg(e.path order by e.last_seen desc))[1],
    sum(e.count)::bigint, max(e.last_seen)
  from private.app_errors e
  where e.day >= current_date - greatest(1, least(admin_app_errors.days, 30))
  group by e.fingerprint
  order by max(e.last_seen) desc
  limit 50;
end;
$$;

revoke execute on function public.report_error(text, text, text, text) from public;
revoke execute on function public.admin_app_errors(integer) from public, anon;
grant execute on function public.report_error(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_app_errors(integer) to authenticated;

-- 03:40 daily: drop reports older than 30 days.
select cron.schedule('app-errors-retention', '40 3 * * *',
  $$delete from private.app_errors where day < current_date - 30$$);
