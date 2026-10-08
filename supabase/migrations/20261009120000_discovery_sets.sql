-- M14.3 Daily Discovery and Weekly Drop (docs/discovery-v2.md §2 V5).
--
-- A set is chosen once per listener and period (their local day / ISO week) by the app — the
-- same candidates and ranking as the feed, new music only — and stored, so it stays stable and
-- can be completed. Completing it (discovering 5 of the daily songs, 10 of the weekly) pays XP
-- once per period, through a trigger on the ledger: only real discoveries count.

alter table public.discovery_point_rules drop constraint discovery_point_rules_kind;
alter table public.discovery_point_rules add constraint discovery_point_rules_kind check (kind in (
  'new_song', 'new_artist', 'new_genre', 'new_country', 'save', 'full_listen', 'share', 'challenge',
  'underground', 'daily_complete', 'weekly_complete'
));
insert into public.discovery_point_rules (kind, points, daily_cap) values
  ('daily_complete', 100, 100),
  ('weekly_complete', 250, 250);

create table public.discovery_sets (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint discovery_sets_kind check (kind in ('daily', 'weekly')),
  period_start date not null,
  -- [{track_id, section, reason, genre_id?, country_code?}] in play order.
  items jsonb not null constraint discovery_sets_items check (
    jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 24),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, kind, period_start)
);

create index discovery_sets_items_idx on public.discovery_sets using gin (items jsonb_path_ops);

alter table public.discovery_sets enable row level security;
revoke all on public.discovery_sets from anon, authenticated;
grant select on public.discovery_sets to authenticated;
create policy discovery_sets_own on public.discovery_sets for select to authenticated
  using (user_id = (select auth.uid()));

/** The start of the listener's current day or ISO week (their time zone). */
create function private.set_period(listener uuid, kind text)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case kind
    when 'daily' then (now() at time zone private.listener_tz(listener))::date
    else date_trunc('week', now() at time zone private.listener_tz(listener))::date
  end;
$$;

revoke execute on function private.set_period(uuid, text) from public, anon, authenticated;

/** Songs of a set the listener has discovered (heard ≥ 15 s or a whole preview, ever). */
create function private.set_progress(listener uuid, items jsonb)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from jsonb_array_elements(items) i
  where exists (
    select 1 from public.discovery_points p
    where p.user_id = listener and p.kind = 'new_song' and p.track_id = (i ->> 'track_id')::uuid);
$$;

revoke execute on function private.set_progress(uuid, jsonb) from public, anon, authenticated;

create function private.set_target(kind text, items jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(case kind when 'daily' then 5 else 10 end, jsonb_array_length(items));
$$;

/**
 * Stores this period's set unless one exists (the first one wins: a set never changes within its
 * day/week). Only public tracks; returns the stored set.
 */
create function public.save_discovery_set(set_kind text, chosen jsonb)
returns table (period_start date, items jsonb, completed_at timestamptz, progress integer, target integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  period date;
  clean jsonb;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if save_discovery_set.set_kind not in ('daily', 'weekly') or jsonb_typeof(save_discovery_set.chosen) <> 'array' then
    raise exception 'invalid set' using errcode = '22023';
  end if;
  period := private.set_period(me, save_discovery_set.set_kind);
  -- Kept: the song, its Weekly Drop section and why it was picked (for "Why this song?").
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'track_id', t.id,
        'section', left(coalesce(i.value ->> 'section', ''), 20),
        'reason', left(i.value ->> 'reason', 30),
        'genre_id', case when (i.value ->> 'genre_id') ~ '^[0-9]{1,4}$' then (i.value ->> 'genre_id')::integer end,
        'country_code', case when (i.value ->> 'country_code') ~ '^[A-Z]{2}$' then i.value ->> 'country_code' end))
      order by i.ordinality), '[]'::jsonb)
  into clean
  from jsonb_array_elements(save_discovery_set.chosen) with ordinality i
  join public.tracks t on t.id = case when (i.value ->> 'track_id') ~ '^[0-9a-f-]{36}$' then (i.value ->> 'track_id')::uuid end
  where public.release_is_public(t.release_id) and i.ordinality <= 24;
  if jsonb_array_length(clean) > 0 then
    insert into public.discovery_sets (user_id, kind, period_start, items)
    values (me, save_discovery_set.set_kind, period, clean)
    on conflict do nothing;
  end if;
  return query
    select s.period_start, s.items, s.completed_at, private.set_progress(me, s.items), private.set_target(s.kind, s.items)
    from public.discovery_sets s
    where s.user_id = me and s.kind = save_discovery_set.set_kind and s.period_start = period;
end;
$$;

/** The caller's set for the current period (none yet: no rows). */
create function public.my_discovery_set(kind text)
returns table (period_start date, items jsonb, completed_at timestamptz, progress integer, target integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.period_start, s.items, s.completed_at, private.set_progress(s.user_id, s.items),
    private.set_target(s.kind, s.items)
  from public.discovery_sets s
  where s.user_id = (select auth.uid()) and s.kind = my_discovery_set.kind
    and s.period_start = private.set_period((select auth.uid()), my_discovery_set.kind);
$$;

revoke execute on function public.save_discovery_set(text, jsonb), public.my_discovery_set(text)
  from public, anon;
grant execute on function public.save_discovery_set(text, jsonb), public.my_discovery_set(text)
  to authenticated;

/** A new discovery may complete the listener's current daily/weekly set. */
create function private.discovery_sets_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  for s in
    select d.* from public.discovery_sets d
    where d.user_id = new.user_id and d.completed_at is null
      and d.period_start = private.set_period(new.user_id, d.kind)
      and d.items @> jsonb_build_array(jsonb_build_object('track_id', new.track_id))
  loop
    if private.set_progress(s.user_id, s.items) >= private.set_target(s.kind, s.items) then
      update public.discovery_sets d set completed_at = now()
      where d.user_id = s.user_id and d.kind = s.kind and d.period_start = s.period_start;
      perform private.award(s.user_id, s.kind || '_complete', s.kind || ':' || s.period_start::text);
    end if;
  end loop;
  return null;
end;
$$;

create trigger discovery_points_sets
  after insert on public.discovery_points
  for each row when (new.kind = 'new_song' and new.track_id is not null)
  execute function private.discovery_sets_progress();
