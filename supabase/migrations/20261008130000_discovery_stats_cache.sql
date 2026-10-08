-- Feed aggregates as a cache (docs/discovery-expansion.md §8): discover_candidates no longer scans
-- 30 days of listening and product events per request. Two materialized views hold per-track
-- numbers; pg_cron refreshes them every 5 minutes (new music still appears at once — it just has
-- zero listeners until the next refresh). The same schedule now runs the retention and partition
-- jobs that docs/deployment.md listed as manual.

create materialized view private.track_stats as
with listens as (
  select e.track_id,
    count(distinct e.user_id) as listeners_30d,
    count(distinct e.user_id) filter (where e.started_at > now() - interval '7 days') as listeners_7d,
    count(distinct e.user_id) filter (where e.started_at <= now() - interval '7 days' and e.started_at > now() - interval '14 days') as listeners_prev_7d,
    count(*) as plays_30d,
    avg(e.completed::integer) as completion_rate
  from public.listening_events e
  where e.started_at > now() - interval '30 days' and e.ms_played >= 5000
  group by e.track_id
), saves as (
  select s.track_id, count(*) as saves_30d from public.track_saves s
  where s.created_at > now() - interval '30 days' group by s.track_id
), shown as (
  select pe.track_id,
    count(*) filter (where pe.name = 'song_skipped') as skipped_30d,
    count(*) filter (where pe.name = 'song_impression') as shown_30d
  from private.product_events pe
  where pe.created_at > now() - interval '30 days' and pe.name in ('song_skipped', 'song_impression')
    and pe.track_id is not null
  group by pe.track_id
), ids as (
  select track_id from listens union select track_id from saves union select track_id from shown
)
select ids.track_id,
  coalesce(l.listeners_30d, 0)::integer as listeners_30d,
  coalesce(l.listeners_7d, 0)::integer as listeners_7d,
  coalesce(l.listeners_prev_7d, 0)::integer as listeners_prev_7d,
  coalesce(l.plays_30d, 0)::integer as plays_30d,
  coalesce(l.completion_rate, 0)::real as completion_rate,
  coalesce(s.saves_30d, 0)::integer as saves_30d,
  coalesce(k.skipped_30d, 0)::integer as skipped_30d,
  coalesce(k.shown_30d, 0)::integer as shown_30d
from ids
left join listens l on l.track_id = ids.track_id
left join saves s on s.track_id = ids.track_id
left join shown k on k.track_id = ids.track_id;

create unique index track_stats_track_idx on private.track_stats (track_id);

/** Listeners per track and listener country (regional relevance, "Nearby"). */
create materialized view private.track_country_listeners as
select e.track_id, lp.country_code, count(distinct e.user_id)::integer as listeners_30d
from public.listening_events e
join public.listener_preferences lp on lp.user_id = e.user_id and lp.country_code is not null
where e.started_at > now() - interval '30 days' and e.ms_played >= 5000
group by e.track_id, lp.country_code;

create unique index track_country_listeners_idx on private.track_country_listeners (track_id, country_code);

revoke all on private.track_stats, private.track_country_listeners from public, anon, authenticated;

/** Refreshes the feed aggregates without blocking readers. Run every few minutes (pg_cron). */
create function private.refresh_discovery_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently private.track_stats;
  refresh materialized view concurrently private.track_country_listeners;
end;
$$;

revoke execute on function private.refresh_discovery_stats() from public, anon, authenticated;

create or replace function public.discover_candidates(
  mode text default 'for_you',
  country text default null,
  hide_explicit boolean default false,
  max_results integer default 400
)
returns table (
  track_id uuid,
  public_code text,
  title text,
  duration_ms integer,
  explicit boolean,
  release_id uuid,
  release_slug text,
  release_title text,
  publish_at timestamptz,
  artwork_image_id uuid,
  artist_id uuid,
  artist_slug text,
  artist_name text,
  artist_image_id uuid,
  verified boolean,
  country_code text,
  macro_region text,
  city text,
  languages text[],
  genre_ids smallint[],
  followers integer,
  listeners_30d integer,
  listeners_7d integer,
  listeners_prev_7d integer,
  plays_30d integer,
  completion_rate real,
  replay_rate real,
  save_rate real,
  skip_rate real,
  country_listeners_30d integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with playable as (
    select t.id, t.public_code, t.title, t.duration_ms, (t.explicit or r.explicit) as explicit,
      r.id as release_id, r.slug::text as release_slug, r.title as release_title, r.publish_at,
      r.artwork_image_id, a.id as artist_id, a.slug::text as artist_slug, a.name as artist_name,
      a.image_id as artist_image_id, a.verification_status = 'verified' as verified,
      a.country_code, c.region as macro_region, a.city, a.languages
    from public.tracks t
    join public.releases r on r.id = t.release_id
    join public.artists a on a.id = r.artist_id
    left join public.countries c on c.code = a.country_code
    where r.status = 'published' and r.publish_at <= now() and a.status = 'active'
      and (not discover_candidates.hide_explicit or not (t.explicit or r.explicit))
      and exists (
        select 1 from public.track_audio_uploads u
        join public.track_audio_variants v on v.upload_id = u.id and v.codec = 'aac_lc'
        where u.track_id = t.id and u.status = 'accepted')
  )
  select p.id, p.public_code, p.title, p.duration_ms, p.explicit, p.release_id, p.release_slug, p.release_title,
    p.publish_at, p.artwork_image_id, p.artist_id, p.artist_slug, p.artist_name, p.artist_image_id, p.verified,
    p.country_code, p.macro_region, p.city, p.languages,
    coalesce(
      (select array_agg(g.genre_id order by g.genre_id) from public.release_genres g where g.release_id = p.release_id),
      (select array_agg(g.genre_id order by g.genre_id) from public.artist_genres g where g.artist_id = p.artist_id),
      '{}'),
    (select count(*)::integer from public.artist_follows f where f.artist_id = p.artist_id),
    coalesce(l.listeners_30d, 0)::integer,
    coalesce(l.listeners_7d, 0)::integer,
    coalesce(l.listeners_prev_7d, 0)::integer,
    coalesce(l.plays_30d, 0)::integer,
    coalesce(l.completion_rate, 0)::real,
    case when coalesce(l.listeners_30d, 0) > 0 then greatest(l.plays_30d - l.listeners_30d, 0)::real / l.plays_30d else 0 end,
    case when coalesce(l.listeners_30d, 0) > 0 then least(l.saves_30d::real / l.listeners_30d, 1) else 0 end,
    case when coalesce(l.shown_30d, 0) > 0 then least(l.skipped_30d::real / l.shown_30d, 1) else 0 end,
    coalesce(cl.listeners_30d, 0)::integer
  from playable p
  left join private.track_stats l on l.track_id = p.id
  left join private.track_country_listeners cl on cl.track_id = p.id and cl.country_code = discover_candidates.country
  order by
    case when discover_candidates.mode = 'nearby' and p.country_code = discover_candidates.country then 0 else 1 end,
    case when discover_candidates.mode in ('new', 'nearby') then extract(epoch from p.publish_at) end desc nulls last,
    case when discover_candidates.mode = 'rising' then coalesce(l.listeners_7d, 0) - coalesce(l.listeners_prev_7d, 0) end desc nulls last,
    coalesce(l.listeners_30d, 0) desc,
    p.publish_at desc
  limit least(greatest(max_results, 1), 1000);
$$;

-- Schedules (pg_cron on Supabase). Where pg_cron is missing the jobs are run by hand / by an
-- external scheduler, exactly as before (docs/deployment.md §6).
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('tunewick-discovery-stats', '*/5 * * * *', 'select private.refresh_discovery_stats()');
  perform cron.schedule('tunewick-prune-product-events', '17 3 * * *', 'select private.prune_product_events()');
  perform cron.schedule('tunewick-listening-partitions', '7 2 1 * *',
    $job$select private.create_listening_partition((date_trunc('month', now()) + interval '14 months')::date)$job$);
exception when others then
  raise notice 'pg_cron not available, schedule the jobs externally: %', sqlerrm;
end;
$do$;
