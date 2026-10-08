-- Discover: which recommendation reasons actually work for this listener (docs/discovery-expansion.md
-- §4, P1 "per-listener weight tuning"). Per reason code shown in the feed in the last 60 days: how
-- many distinct songs were shown, and how many of them the listener then liked, saved or whose
-- artist they followed (hits), finished (completes) or skipped. Only the caller's own events; the
-- scoring that turns this into weights lives in @tunewick/shared (tuneWeights).

create function public.my_feed_outcomes()
returns table (reason text, shown integer, hits integer, completes integer, skips integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return query
    select e.reason,
      count(distinct e.track_id) filter (where e.name = 'song_impression')::integer,
      count(distinct e.track_id) filter (where e.name in ('song_liked', 'song_saved', 'artist_followed'))::integer,
      count(distinct e.track_id) filter (where e.name = 'preview_completed')::integer,
      count(distinct e.track_id) filter (where e.name = 'song_skipped')::integer
    from private.product_events e
    where e.user_id = me
      and e.created_at > now() - interval '60 days'
      and e.reason is not null
      and e.track_id is not null
      -- Pinned items are what the listener asked for, not a recommendation.
      and e.reason not in ('shared', 'artist_spotlight')
    group by e.reason;
end;
$$;

revoke execute on function public.my_feed_outcomes() from public, anon;
grant execute on function public.my_feed_outcomes() to authenticated;
