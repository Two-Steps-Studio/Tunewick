-- Music Graph from live music (M8.3): artists who shared a published lineup "played together".
-- Derived like the catalog edges (graph_edges), rebuilt when events or lineups change; the
-- evidence is one real event (its title and date). related_artists ranks it below collaboration.

create function private.refresh_event_graph()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.graph_edges where src_type = 'artist' and dst_type = 'artist' and relation = 'played_together';
  insert into public.graph_edges (src_type, src_id, dst_type, dst_id, relation, weight, derived_from)
  select 'artist', a.artist_id, 'artist', b.artist_id, 'played_together', count(distinct e.id),
    (array_agg(jsonb_build_object('event', e.title, 'starts_at', e.starts_at) order by e.starts_at desc))[1]
  from public.event_lineup a
  join public.event_lineup b on b.event_id = a.event_id and b.artist_id <> a.artist_id
  join public.events e on e.id = a.event_id and e.status = 'published'
  join public.artists x on x.id = a.artist_id and x.status = 'active'
  join public.artists y on y.id = b.artist_id and y.status = 'active'
  group by a.artist_id, b.artist_id;
end;
$$;

revoke execute on function private.refresh_event_graph() from public, anon, authenticated;

create function private.refresh_event_graph_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_event_graph();
  return null;
end;
$$;

create trigger events_refresh_graph after update of status on public.events
  for each statement execute function private.refresh_event_graph_trigger();
create trigger event_lineup_refresh_graph after insert or delete on public.event_lineup
  for each statement execute function private.refresh_event_graph_trigger();
create trigger artists_refresh_event_graph after update of status on public.artists
  for each statement execute function private.refresh_event_graph_trigger();

select private.refresh_event_graph();
