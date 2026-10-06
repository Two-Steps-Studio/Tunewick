-- Release review and publishing (M5.0, docs/product.md: nothing reaches listeners unchecked).
--
-- draft/rejected --submit--> in_review --approve--> published (publish_at = release date or now)
--                                      --return---> rejected (with a note for the artist)
-- in_review --withdraw--> draft
-- Status is never client-writable; every transition goes through a function below. Staff
-- decisions require a moderator/admin role and MFA in the session, and are audit-logged.

alter table public.releases
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  -- Why a release was returned; visible to its members, cleared on approval.
  add column review_note text constraint releases_review_note_length check (char_length(review_note) <= 2000);

create type public.release_review_kind as enum ('submitted', 'withdrawn', 'approved', 'returned');

-- What happened to a submission, for the artist's history. Moderator identity stays in the
-- private audit log only.
create table public.release_review_events (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.releases (id) on delete cascade,
  kind public.release_review_kind not null,
  note text constraint release_review_events_note_length check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index release_review_events_release_idx on public.release_review_events (release_id, created_at);

alter table public.release_review_events enable row level security;

create policy "release review events: members and staff"
  on public.release_review_events for select to authenticated
  using (
    exists (
      select 1 from public.releases r
      where r.id = release_id and (public.is_artist_member(r.artist_id) or public.is_staff())
    )
  );

revoke all on public.release_review_events from anon, authenticated;
grant select on public.release_review_events to authenticated;

-- ---------------------------------------------------------------------------
-- Readiness — the same rules the editor's checklist shows, enforced here.
-- ---------------------------------------------------------------------------
create function public.release_readiness(release uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.can_view_release(release) then null else jsonb_build_object(
    'tracks', exists (select 1 from public.tracks t where t.release_id = release),
    'ai', coalesce((select r.ai_content <> 'unknown' from public.releases r where r.id = release), false),
    'rights', exists (select 1 from public.rights_declarations d where d.release_id = release),
    -- Every track's newest master has been checked and accepted by the audio worker.
    'audio', exists (select 1 from public.tracks t where t.release_id = release)
      and not exists (
        select 1 from public.tracks t
        where t.release_id = release
          and coalesce(
            (select u.status from public.track_audio_uploads u
             where u.track_id = t.id order by u.created_at desc limit 1),
            'pending'
          ) <> 'accepted'
      )
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- Member actions
-- ---------------------------------------------------------------------------
create function public.submit_release(release uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current public.releases;
  ready jsonb;
begin
  select * into current from public.releases r where r.id = submit_release.release for update;
  if current.id is null or not public.is_artist_member(current.artist_id) then
    raise exception 'not allowed to submit this release' using errcode = '42501';
  end if;
  if current.status not in ('draft', 'rejected') then
    raise exception 'only drafts and returned releases can be submitted' using errcode = '55000';
  end if;

  ready := public.release_readiness(current.id);
  if not ((ready ->> 'tracks')::boolean and (ready ->> 'ai')::boolean
          and (ready ->> 'rights')::boolean and (ready ->> 'audio')::boolean) then
    raise exception 'release is not ready for review' using errcode = '55000', detail = ready::text;
  end if;

  update public.releases r
  set status = 'in_review', submitted_at = now(), review_note = null
  where r.id = current.id;
  insert into public.release_review_events (release_id, kind) values (current.id, 'submitted');
end;
$$;

create function public.withdraw_release_submission(release uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.releases r
  set status = 'draft', submitted_at = null
  where r.id = withdraw_release_submission.release
    and r.status = 'in_review'
    and public.is_artist_member(r.artist_id);
  if not found then
    raise exception 'no submission to withdraw' using errcode = '55000';
  end if;
  insert into public.release_review_events (release_id, kind)
  values (withdraw_release_submission.release, 'withdrawn');
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff decision (moderator or admin, with MFA)
-- ---------------------------------------------------------------------------
create function public.review_release(release uuid, decision text, note text default null)
returns public.release_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current public.releases;
  publish timestamptz;
  local_today date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if not public.is_staff() then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'multi-factor authentication required' using errcode = '42501', hint = 'mfa_required';
  end if;

  select * into current from public.releases r where r.id = review_release.release for update;
  if current.id is null or current.status <> 'in_review' then
    raise exception 'release is not waiting for review' using errcode = '55000';
  end if;

  if review_release.decision = 'approve' then
    -- A future release date schedules the release (midnight in Poland); otherwise it goes live now.
    publish := case
      when current.release_date > local_today
        then current.release_date::timestamp at time zone 'Europe/Warsaw'
      else now()
    end;
    update public.releases r
    set status = 'published', publish_at = publish, reviewed_at = now(), review_note = null
    where r.id = current.id;
    insert into public.release_review_events (release_id, kind) values (current.id, 'approved');
    perform private.write_audit('release.approve', 'release', current.id::text,
      jsonb_build_object('status', current.status),
      jsonb_build_object('status', 'published', 'publish_at', publish));
    return 'published'::public.release_status;
  end if;

  if review_release.decision = 'return' then
    if char_length(btrim(coalesce(review_release.note, ''))) < 10 then
      raise exception 'a returned release needs a note for the artist (at least 10 characters)'
        using errcode = '22023';
    end if;
    update public.releases r
    set status = 'rejected', reviewed_at = now(), review_note = btrim(review_release.note)
    where r.id = current.id;
    insert into public.release_review_events (release_id, kind, note)
    values (current.id, 'returned', btrim(review_release.note));
    perform private.write_audit('release.return', 'release', current.id::text,
      jsonb_build_object('status', current.status),
      jsonb_build_object('status', 'rejected', 'note', btrim(review_release.note)));
    return 'rejected'::public.release_status;
  end if;

  raise exception 'decision must be approve or return' using errcode = '22023';
end;
$$;

revoke execute on function
  public.release_readiness(uuid),
  public.submit_release(uuid),
  public.withdraw_release_submission(uuid),
  public.review_release(uuid, text, text)
from public, anon;

grant execute on function
  public.release_readiness(uuid),
  public.submit_release(uuid),
  public.withdraw_release_submission(uuid),
  public.review_release(uuid, text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Playback data for a release the caller may see (public once released; members and staff
-- earlier). Anonymous listeners cannot read track_audio_uploads, so this exposes exactly what the
-- player needs: the newest accepted master's source description and its delivery variants.
-- ---------------------------------------------------------------------------
create function public.release_playback(release uuid)
returns table (track_id uuid, upload_id uuid, source jsonb, variants jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    u.id,
    jsonb_build_object(
      'container', u.report -> 'input' ->> 'container',
      'codec', u.report -> 'input' ->> 'codec',
      'sample_rate', (u.report -> 'input' ->> 'sample_rate')::integer,
      'bits', (u.report -> 'input' ->> 'bits')::integer,
      'effective_bits', (u.report -> 'analysis' ->> 'effective_bits')::integer,
      'effective_sample_rate', (u.report -> 'analysis' ->> 'effective_sample_rate')::integer,
      'authenticity', u.report -> 'analysis' ->> 'authenticity',
      'upsampled_from', (u.report -> 'analysis' ->> 'upsampled_from')::integer,
      'flags', coalesce(u.report -> 'analysis' -> 'flags', '[]'::jsonb),
      'integrated_lufs', u.integrated_lufs,
      'true_peak_dbtp', u.true_peak_dbtp
    ),
    coalesce(
      (select jsonb_agg(to_jsonb(v) - 'upload_id' order by v.tier, v.container)
       from public.track_audio_variants v where v.upload_id = u.id),
      '[]'::jsonb
    )
  from public.tracks t
  join lateral (
    select * from public.track_audio_uploads a
    where a.track_id = t.id and a.status = 'accepted'
    order by a.created_at desc
    limit 1
  ) u on true
  where t.release_id = release_playback.release
    and public.can_view_release(release_playback.release)
  order by t.disc_number, t.track_number;
$$;

revoke execute on function public.release_playback(uuid) from public;
grant execute on function public.release_playback(uuid) to anon, authenticated;
