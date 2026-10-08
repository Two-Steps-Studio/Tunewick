-- "Byłem przy tym" (M8.2, product.md §4.4): a memory, not a counter. Marked only for a real,
-- published event, from its start to 30 days later (database-enforced). Private to the
-- listener; no public counts (anti-farming).

create table public.event_attendance (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index event_attendance_recent_idx on public.event_attendance (user_id, created_at desc);

alter table public.event_attendance enable row level security;
create policy event_attendance_own_read on public.event_attendance for select to authenticated
  using (user_id = (select auth.uid()));
create policy event_attendance_own_delete on public.event_attendance for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.event_attendance from anon, authenticated;
grant select, delete on public.event_attendance to authenticated;

/** Marks "I was there": the event is published and happening or happened within 30 days. */
create function public.mark_attended(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into e from public.events x where x.id = event;
  if e.id is null or e.status <> 'published' then
    raise exception 'only published events' using errcode = 'P0002';
  end if;
  if now() < e.starts_at then
    raise exception 'the event has not started yet' using errcode = '55000', hint = 'not_started';
  end if;
  if now() > e.starts_at + interval '30 days' then
    raise exception 'it is too late to mark this event' using errcode = '55000', hint = 'too_late';
  end if;
  insert into public.event_attendance (user_id, event_id) values ((select auth.uid()), event)
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_attended(uuid) from public, anon;
grant execute on function public.mark_attended(uuid) to authenticated;
