-- Playback telemetry (M11, architecture.md §11 budgets: first audio < 1 s for cached High).
-- Anonymous by design: no user id is stored with a metric — only the day, tier, strategy,
-- browser family and the outcome. Signed-in players report (rate-limited per account via a
-- separate hourly counter that holds no playback data).

create table private.playback_metrics (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  outcome text not null constraint playback_metrics_outcome check (outcome in ('started', 'error')),
  tier public.quality_tier,
  strategy text constraint playback_metrics_strategy check (strategy in ('mse', 'native')),
  browser text constraint playback_metrics_browser check (browser in ('chrome', 'firefox', 'safari', 'edge', 'other')),
  first_audio_ms integer constraint playback_metrics_first_audio check (first_audio_ms between 0 and 120000),
  error_code text constraint playback_metrics_error check (error_code in ('media_error', 'stream_error', 'playback_blocked', 'unplayable')),
  created_at timestamptz not null default now()
);

create index playback_metrics_day_idx on private.playback_metrics (day);

create table private.playback_report_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  hour timestamptz not null,
  reports integer not null default 0,
  primary key (user_id, hour)
);

create function public.report_playback(
  outcome text,
  tier public.quality_tier default null,
  strategy text default null,
  browser text default null,
  first_audio_ms integer default null,
  error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  counted integer;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into private.playback_report_counts as c (user_id, hour, reports)
  values (caller, date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set reports = c.reports + 1
  returning c.reports into counted;
  if counted > 300 then
    return; -- quietly drop: telemetry must never get in the way of listening
  end if;
  insert into private.playback_metrics (outcome, tier, strategy, browser, first_audio_ms, error_code)
  values (report_playback.outcome, report_playback.tier, report_playback.strategy, report_playback.browser,
    case when report_playback.outcome = 'started' then report_playback.first_audio_ms end,
    case when report_playback.outcome = 'error' then report_playback.error_code end);
exception when check_violation then
  raise exception 'invalid playback report' using errcode = '22023';
end;
$$;

/** Per tier over the last `days`: starts, median and p90 time to first audio, errors (admin + aal2). */
create function public.admin_playback_summary(days integer default 7)
returns table (
  tier public.quality_tier,
  starts integer,
  first_audio_p50_ms integer,
  first_audio_p90_ms integer,
  errors integer,
  top_error text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
    select m.tier,
      count(*) filter (where m.outcome = 'started')::integer,
      (percentile_cont(0.5) within group (order by m.first_audio_ms))::integer,
      (percentile_cont(0.9) within group (order by m.first_audio_ms))::integer,
      count(*) filter (where m.outcome = 'error')::integer,
      mode() within group (order by m.error_code)
    from private.playback_metrics m
    where m.day > current_date - least(greatest(days, 1), 90)
    group by m.tier
    order by m.tier nulls last;
end;
$$;

revoke execute on function public.report_playback(text, public.quality_tier, text, text, integer, text) from public, anon;
grant execute on function public.report_playback(text, public.quality_tier, text, text, integer, text) to authenticated;
revoke execute on function public.admin_playback_summary(integer) from public, anon;
grant execute on function public.admin_playback_summary(integer) to authenticated;
