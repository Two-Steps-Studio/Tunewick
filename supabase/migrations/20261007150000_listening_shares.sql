-- Monthly user-centric listening shares (D2, database.md §3.6, promotions.md). The base for future
-- payouts: how one listener's month splits across artists. Nothing is paid from it yet — Tunewick
-- has no paid plans — but the data model records attribution from day one.
-- A play qualifies at >= 30 s and never as a soundcheck. Months are closed by a monthly job and can
-- be recomputed (idempotent) while raw events exist. On account deletion the shares are detached
-- (user_id null) so accounting totals survive without the person (legal L4 to confirm).

create table public.listening_monthly_artist_shares (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  month date not null constraint listening_shares_month check (month = date_trunc('month', month)::date),
  artist_id uuid not null references public.artists (id) on delete cascade,
  qualified_plays integer not null constraint listening_shares_plays check (qualified_plays > 0),
  ms_played bigint not null,
  computed_at timestamptz not null default now(),
  constraint listening_shares_unique unique (user_id, month, artist_id)
);

create index listening_shares_month_artist_idx on public.listening_monthly_artist_shares (month, artist_id);

alter table public.listening_monthly_artist_shares enable row level security;
-- A listener sees their own months (transparency, export); nobody writes through the API.
create policy listening_shares_own_read on public.listening_monthly_artist_shares for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.listening_monthly_artist_shares from anon, authenticated;
grant select on public.listening_monthly_artist_shares to authenticated;

/** Recomputes one month from raw listens; returns the number of share rows written. */
create function private.aggregate_listening_month(month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  first date := date_trunc('month', month)::date;
  written integer;
begin
  delete from public.listening_monthly_artist_shares s where s.month = first and s.user_id is not null;
  insert into public.listening_monthly_artist_shares (user_id, month, artist_id, qualified_plays, ms_played)
  select e.user_id, first, e.artist_id, count(*), sum(e.ms_played)
  from public.listening_events e
  where e.started_at >= first and e.started_at < first + interval '1 month'
    and e.ms_played >= 30000 and not e.soundcheck
  group by e.user_id, e.artist_id;
  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function private.aggregate_listening_month(date) from public, anon, authenticated;

/** Real listener numbers for an artist's team: last six closed months. */
create function public.artist_monthly_listening(artist uuid)
returns table (month date, listeners integer, qualified_plays integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.month, count(distinct s.user_id)::integer, sum(s.qualified_plays)::integer
  from public.listening_monthly_artist_shares s
  where s.artist_id = artist and public.is_artist_member(artist)
    and s.month >= (date_trunc('month', now()) - interval '6 months')::date
  group by s.month
  order by s.month desc;
$$;

/** Admin: one month's totals per artist (base for the payout statement). */
create function public.admin_listening_shares(month date)
returns table (artist_id uuid, artist_name text, artist_slug text, listeners integer, qualified_plays integer, hours numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
  select a.id, a.name, a.slug::text, count(distinct s.user_id)::integer, sum(s.qualified_plays)::integer,
    round(sum(s.ms_played) / 3600000.0, 1)
  from public.listening_monthly_artist_shares s
  join public.artists a on a.id = s.artist_id
  where s.month = date_trunc('month', admin_listening_shares.month)::date
  group by a.id
  order by sum(s.qualified_plays) desc
  limit 200;
end;
$$;

revoke execute on function public.artist_monthly_listening(uuid) from public, anon;
revoke execute on function public.admin_listening_shares(date) from public, anon;
grant execute on function public.artist_monthly_listening(uuid) to authenticated;
grant execute on function public.admin_listening_shares(date) to authenticated;

-- 04:00 on the 2nd: close the previous month (late listens of the month's last night included).
select cron.schedule('listening-shares', '0 4 2 * *',
  $$select private.aggregate_listening_month((date_trunc('month', now()) - interval '1 month')::date)$$);
