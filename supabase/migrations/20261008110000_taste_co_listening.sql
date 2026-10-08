-- Similar listeners (P1, docs/discovery-expansion.md §4): besides shared follows, the feed now
-- learns from shared listening — artists played by people who play what the caller plays.

create or replace function public.my_taste()
returns jsonb
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
  return jsonb_build_object(
    'preferences', (
      select to_jsonb(lp) - 'user_id' - 'created_at' - 'updated_at'
      from public.listener_preferences lp where lp.user_id = me),
    -- Affinities from likes and saves (+3), listens (+0.5 … +1.5, short ones −0.5), skips (−1),
    -- follows (+5 per artist) and onboarding genres (+3), summed per artist, genre and country.
    'artists', coalesce((select jsonb_agg(jsonb_build_object('id', a.artist_id, 'w', a.w)) from (
        select artist_id, sum(w) as w from (
          select s.artist_id, s.w from private.taste_signals(me) s
          union all
          select f.artist_id, 5.0 from public.artist_follows f where f.user_id = me
        ) x group by artist_id order by abs(sum(w)) desc limit 300) a), '[]'::jsonb),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('id', g.genre_id, 'w', g.w)) from (
        select genre_id, sum(w) as w from (
          select coalesce(rg.genre_id, ag.genre_id) as genre_id, s.w
          from private.taste_signals(me) s
          join public.tracks t on t.id = s.track_id
          left join public.release_genres rg on rg.release_id = t.release_id
          left join public.artist_genres ag on rg.genre_id is null and ag.artist_id = s.artist_id
          union all
          select ag.genre_id, 2.0 from public.artist_follows f
          join public.artist_genres ag on ag.artist_id = f.artist_id where f.user_id = me
          union all
          select unnest(lp.genre_ids), 3.0 from public.listener_preferences lp where lp.user_id = me
        ) x where genre_id is not null group by genre_id) g), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('code', c.country_code, 'w', c.w)) from (
        select a.country_code, sum(s.w) as w from private.taste_signals(me) s
        join public.artists a on a.id = s.artist_id
        where a.country_code is not null group by a.country_code) c), '[]'::jsonb),
    'skipped', coalesce((
      select jsonb_agg(distinct pe.track_id) from private.product_events pe
      where pe.user_id = me and pe.name = 'song_skipped' and pe.created_at > now() - interval '30 days'
        and pe.track_id is not null), '[]'::jsonb),
    'followed_artists', coalesce((select jsonb_agg(f.artist_id) from public.artist_follows f where f.user_id = me), '[]'::jsonb),
    -- Artists followed by listeners who share at least one follow with the caller.
    'co_followed', coalesce((
      select jsonb_agg(jsonb_build_object('artist', c.artist_id, 'n', c.n))
      from (
        select f2.artist_id, count(distinct f2.user_id) as n
        from public.artist_follows mine
        join public.artist_follows f1 on f1.artist_id = mine.artist_id and f1.user_id <> me
        join public.artist_follows f2 on f2.user_id = f1.user_id
        where mine.user_id = me
          and not exists (select 1 from public.artist_follows x where x.user_id = me and x.artist_id = f2.artist_id)
        group by f2.artist_id
        order by count(distinct f2.user_id) desc
        limit 100
      ) c), '[]'::jsonb),
    -- Artists that listeners with a similar ear play: people who meaningfully played (≥ 30 s,
    -- 90 days) at least one of the caller's top artists, and what else they played. Counts
    -- people, not plays, so one heavy listener cannot dominate.
    'co_listened', coalesce((
      select jsonb_agg(jsonb_build_object('artist', c.artist_id, 'n', c.n))
      from (
        with mine as (
          select e.artist_id from public.listening_events e
          where e.user_id = me and e.started_at > now() - interval '90 days'
            and (e.ms_played >= 30000 or e.completed)
          group by e.artist_id order by count(*) desc limit 50
        ), peers as (
          select distinct e.user_id from public.listening_events e
          join mine m on m.artist_id = e.artist_id
          where e.user_id <> me and e.started_at > now() - interval '90 days'
            and (e.ms_played >= 30000 or e.completed)
          limit 500
        )
        select e.artist_id, count(distinct e.user_id) as n
        from public.listening_events e
        join peers p on p.user_id = e.user_id
        where e.started_at > now() - interval '90 days' and (e.ms_played >= 30000 or e.completed)
          and e.artist_id not in (select artist_id from mine)
        group by e.artist_id
        having count(distinct e.user_id) >= 2
        order by count(distinct e.user_id) desc
        limit 100
      ) c), '[]'::jsonb),
    -- Already discovered (heard ≥ 15 s) and shown recently.
    'heard', coalesce((
      select jsonb_agg(p.track_id) from public.discovery_points p
      where p.user_id = me and p.kind = 'new_song' and p.track_id is not null), '[]'::jsonb),
    'recently_shown', coalesce((
      select jsonb_agg(distinct pe.track_id) from private.product_events pe
      where pe.user_id = me and pe.name = 'song_impression' and pe.created_at > now() - interval '2 days'
        and pe.track_id is not null), '[]'::jsonb)
  );
end;
$$;

