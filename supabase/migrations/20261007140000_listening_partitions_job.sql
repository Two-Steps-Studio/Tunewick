-- Listening history partitions are kept ahead automatically (M11.7). A monthly pg_cron job makes
-- sure the next months exist. If a month was missed and its rows already landed in the default
-- partition, they are moved into the new partition in the same transaction (attaching a partition
-- over rows the default partition holds would otherwise fail).

/** Ensures partitions for this month and `months_ahead` more; returns how many it created. */
create function private.ensure_listening_partitions(months_ahead integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  first date;
  name text;
  created integer := 0;
  rows_to_move public.listening_events[];
begin
  for m in 0..greatest(months_ahead, 0) loop
    first := (date_trunc('month', now()) + make_interval(months => m))::date;
    name := format('listening_events_%s', to_char(first, 'YYYY_MM'));
    continue when to_regclass(format('private.%I', name)) is not null;

    -- Rows already in the default partition for this month (a missed run) move with it.
    with moved as (
      delete from private.listening_events_default d
      where d.started_at >= first and d.started_at < (first + interval '1 month')
      returning d.*
    )
    select array_agg(row(moved.*)::public.listening_events) into rows_to_move from moved;

    execute format(
      'create table private.%I partition of public.listening_events for values from (%L) to (%L)',
      name, first, (first + interval '1 month')::date);
    if rows_to_move is not null then
      insert into public.listening_events select * from unnest(rows_to_move);
    end if;
    created := created + 1;
  end loop;
  return created;
end;
$$;

revoke execute on function private.ensure_listening_partitions(integer) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- 03:15 on the first day of every month; keeps three months ahead.
select cron.schedule('listening-partitions', '15 3 1 * *',
  $$select private.ensure_listening_partitions(3)$$);
