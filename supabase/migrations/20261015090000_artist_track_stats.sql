-- Per-song numbers for an artist's team (Artist → Manage): the last 28 days of listening (a play
-- counts at 30 s, soundchecks never) and what listeners kept doing with each song - saves, likes,
-- playlist adds. Counts only, never who. Team members only; anyone else gets no rows.
create function public.artist_track_stats(artist uuid)
returns table (
  track_id uuid,
  title text,
  release_title text,
  listeners_28d integer,
  plays_28d integer,
  completion_rate numeric,
  saves integer,
  likes integer,
  playlist_adds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with songs as (
    select t.id, t.title, r.title as release_title, r.publish_at, t.disc_number, t.track_number
    from public.tracks t
    join public.releases r on r.id = t.release_id
    where r.artist_id = artist and r.status = 'published' and public.is_artist_member(artist)
  ),
  plays as (
    select e.track_id, count(distinct e.user_id) as listeners, count(*) as plays,
      avg(case when e.completed then 1.0 else 0.0 end) as completion
    from public.listening_events e
    where e.artist_id = artist and e.started_at >= now() - interval '28 days'
      and e.ms_played >= 30000 and not e.soundcheck
    group by e.track_id
  )
  select s.id, s.title, s.release_title,
    coalesce(p.listeners, 0)::integer,
    coalesce(p.plays, 0)::integer,
    round(p.completion, 2),
    (select count(*) from public.track_saves x where x.track_id = s.id)::integer,
    (select count(*) from public.track_likes x where x.track_id = s.id)::integer,
    (select count(distinct x.playlist_id) from public.playlist_tracks x where x.track_id = s.id)::integer
  from songs s
  left join plays p on p.track_id = s.id
  order by coalesce(p.plays, 0) desc, s.publish_at desc nulls last, s.disc_number, s.track_number
  limit 200;
$$;

revoke execute on function public.artist_track_stats(uuid) from public, anon;
grant execute on function public.artist_track_stats(uuid) to authenticated;
