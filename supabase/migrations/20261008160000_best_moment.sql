-- Best moment (docs/audio.md §2.6): the worker (report v2) suggests where a 30-second preview
-- should start — loud relative to the rest of the track and at a section boundary — and draws a
-- 200-point waveform. The artist's own soundcheck start always wins; the suggestion replaces the
-- old fixed fallback (a third into the track) for everyone who did not choose.

alter table public.track_audio_uploads
  add column best_moment_ms integer generated always as (
    case when (report -> 'analysis' -> 'best_moment' ->> 'start_ms') ~ '^[0-9]{1,8}$'
      then (report -> 'analysis' -> 'best_moment' ->> 'start_ms')::integer end
  ) stored;

comment on column public.track_audio_uploads.best_moment_ms is
  'Suggested preview start from the worker analysis (null for reports before v2).';

-- Previews: the suggestion is returned next to the artist's choice; the app picks.
drop function public.track_previews(uuid[]);

create function public.track_previews(tracks uuid[])
returns table (
  track_id uuid,
  duration_ms integer,
  preview_start_ms integer,
  preview_duration_ms integer,
  suggested_start_ms integer,
  variants jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.duration_ms, t.soundcheck_start_ms, t.soundcheck_duration_ms, u.best_moment_ms,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier', v.tier, 'codec', v.codec, 'container', v.container, 'sample_rate', v.sample_rate,
        'bitrate_kbps', v.bitrate_kbps, 'nominal_kbps', v.nominal_kbps, 'samples', v.samples,
        'encoder_delay_samples', v.encoder_delay_samples, 'padding_samples', v.padding_samples,
        'object_key', v.object_key) order by v.tier)
      from public.track_audio_variants v where v.upload_id = u.id and v.codec = 'aac_lc'), '[]'::jsonb)
  from public.tracks t
  join lateral (
    select a.id, a.best_moment_ms from public.track_audio_uploads a
    where a.track_id = t.id and a.status = 'accepted'
    order by a.created_at desc limit 1
  ) u on true
  where t.id = any (track_previews.tracks[1:50])
    and public.release_is_public(t.release_id);
$$;

revoke execute on function public.track_previews(uuid[]) from public;
grant execute on function public.track_previews(uuid[]) to anon, authenticated;

-- Release soundchecks (M7.4): a release whose artist chose no excerpt starts at the best moment of
-- its first track instead of at 0:00. A chosen excerpt still comes first. Security definer now:
-- uploads are private to the artist's team, and only public releases are returned.
create or replace function public.release_soundchecks(releases uuid[])
returns table (release_id uuid, track_id uuid, title text, start_ms integer, duration_ms integer)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (t.release_id) t.release_id, t.id, t.title,
    coalesce(t.soundcheck_start_ms, m.best_moment_ms, 0),
    least(coalesce(t.soundcheck_duration_ms, 30000),
      greatest(coalesce(t.duration_ms, 30000) - coalesce(t.soundcheck_start_ms, m.best_moment_ms, 0), 1000))
  from public.tracks t
  left join lateral (
    select a.best_moment_ms from public.track_audio_uploads a
    where a.track_id = t.id and a.status = 'accepted'
    order by a.created_at desc limit 1
  ) m on true
  where t.release_id = any (releases) and public.release_is_public(t.release_id)
  order by t.release_id, (t.soundcheck_start_ms is null), t.disc_number, t.track_number;
$$;
