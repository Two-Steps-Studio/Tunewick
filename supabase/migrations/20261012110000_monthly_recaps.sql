-- M14.6 Monthly recap (docs/discovery-v2.md M14.6).
--
-- A month's recap is the listener's statistics for that local month (private.listening_stats).
-- Once the month is over it never changes, so the first read stores it and later reads (the page,
-- every share card) are one indexed row. The running month is computed live and never stored.

create table public.listening_recaps (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  stats jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.listening_recaps enable row level security;
create policy "listening recaps own" on public.listening_recaps
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.listening_recaps from anon, authenticated;
grant select on public.listening_recaps to authenticated;

/**
 * The caller's recap for the local month containing `month_start` (any day of it). Not before the
 * listener joined and not in the future; null then.
 */
create function public.my_month_recap(month_start date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  listener uuid := (select auth.uid());
  first_day date := date_trunc('month', month_start)::date;
  next_month date := (date_trunc('month', month_start) + interval '1 month')::date;
  today date;
  joined date;
  result jsonb;
begin
  if listener is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  today := (now() at time zone private.listener_tz(listener))::date;
  select (u.created_at at time zone private.listener_tz(listener))::date into joined
  from auth.users u where u.id = listener;
  if first_day > today or next_month <= date_trunc('month', joined)::date then
    return null;
  end if;

  select r.stats into result from public.listening_recaps r
  where r.user_id = listener and r.month = first_day;
  if result is not null then
    return result;
  end if;

  result := private.listening_stats(listener, first_day, next_month);
  -- Stored from the second day after the month: late listens (the daily aggregates refresh every
  -- few minutes) are in by then.
  if next_month < today then
    insert into public.listening_recaps (user_id, month, stats)
    values (listener, first_day, result)
    on conflict (user_id, month) do nothing;
  end if;
  return result;
end;
$$;

revoke execute on function public.my_month_recap(date) from public, anon;
grant execute on function public.my_month_recap(date) to authenticated;
