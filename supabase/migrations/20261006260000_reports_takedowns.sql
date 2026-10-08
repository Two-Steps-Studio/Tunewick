-- Reports, takedowns and appeals (M10.2, security.md §9, licensing.md §5, EU DSA notice-and-action).
-- Anyone signed in can report public content; moderators decide with a statement of reasons the
-- affected artist (or playlist owner) can read; they can appeal once, and a different moderator
-- decides the appeal. Every decision is audited; nothing is deleted.

create type public.report_subject as enum ('artist', 'release', 'playlist');
create type public.report_reason as enum ('copyright', 'illegal', 'hate', 'impersonation', 'spam', 'other');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  subject_type public.report_subject not null,
  subject_id uuid not null,
  reason public.report_reason not null,
  details text not null constraint reports_details_length check (char_length(details) between 10 and 2000),
  reporter_id uuid references auth.users (id) on delete set null,
  -- Copyright notices (licensing.md §5): who claims, how to reach them, good-faith statement.
  claimant_name text constraint reports_claimant_name_length check (char_length(claimant_name) <= 200),
  claimant_email text constraint reports_claimant_email_length check (char_length(claimant_email) <= 254),
  good_faith boolean not null default false,
  status text not null default 'open' constraint reports_status check (status in ('open', 'actioned', 'dismissed')),
  decision_id uuid,
  created_at timestamptz not null default now(),
  constraint reports_copyright_notice check (
    reason <> 'copyright' or (claimant_name is not null and claimant_email is not null and good_faith)
  )
);

create index reports_open_idx on public.reports (status, created_at);
create index reports_subject_idx on public.reports (subject_type, subject_id);

create table public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  subject_type public.report_subject not null,
  subject_id uuid not null,
  -- Whose content it is: the artist (artist, release) or the playlist owner.
  artist_id uuid references public.artists (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  action text not null constraint moderation_decisions_action
    check (action in ('dismiss', 'takedown_release', 'suspend_artist', 'hide_playlist')),
  reason public.report_reason not null,
  -- Statement of reasons (DSA art. 17): what was decided and why, in words the owner understands.
  statement text not null constraint moderation_decisions_statement check (char_length(statement) between 20 and 4000),
  previous_state jsonb not null default '{}'::jsonb,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  appeal_text text constraint moderation_decisions_appeal check (char_length(appeal_text) between 10 and 4000),
  appealed_at timestamptz,
  appeal_status text not null default 'none'
    constraint moderation_decisions_appeal_status check (appeal_status in ('none', 'pending', 'upheld', 'reversed')),
  appeal_note text,
  appeal_decided_by uuid references auth.users (id) on delete set null,
  appeal_decided_at timestamptz
);

create index moderation_decisions_artist_idx on public.moderation_decisions (artist_id, decided_at desc);
create index moderation_decisions_appeals_idx on public.moderation_decisions (appeal_status, appealed_at);

alter table public.reports add constraint reports_decision_fkey
  foreign key (decision_id) references public.moderation_decisions (id) on delete set null;

alter table public.reports enable row level security;
alter table public.moderation_decisions enable row level security;

create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_staff()));
create policy moderation_decisions_read on public.moderation_decisions for select to authenticated
  using (
    (select public.is_staff())
    or owner_id = (select auth.uid())
    or (artist_id is not null and public.is_artist_member(artist_id))
  );

revoke all on public.reports, public.moderation_decisions from anon, authenticated;
grant select on public.reports, public.moderation_decisions to authenticated;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

/** Who owns the subject, and whether it is public right now (only public content is reported). */
create function private.report_subject_owner(subject_type public.report_subject, subject_id uuid)
returns table (artist_id uuid, owner_id uuid, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, null::uuid, a.status = 'active'
  from public.artists a where subject_type = 'artist' and a.id = subject_id
  union all
  select r.artist_id, null::uuid, public.release_is_public(r.id)
  from public.releases r where subject_type = 'release' and r.id = subject_id
  union all
  select null::uuid, p.owner_id, p.visibility in ('public', 'unlisted')
  from public.playlists p where subject_type = 'playlist' and p.id = subject_id;
$$;

revoke execute on function private.report_subject_owner(public.report_subject, uuid) from public, anon, authenticated;

create function public.submit_report(
  subject_type public.report_subject,
  subject_id uuid,
  reason public.report_reason,
  details text,
  claimant_name text default null,
  claimant_email text default null,
  good_faith boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  created uuid;
begin
  if caller is null then
    raise exception 'sign in to report' using errcode = '42501';
  end if;
  if not coalesce((select o.is_public from private.report_subject_owner(submit_report.subject_type, submit_report.subject_id) o), false) then
    raise exception 'nothing public to report here' using errcode = 'P0002';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = caller and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many reports today' using errcode = '54000';
  end if;
  -- One open report per person and subject; more details go into the existing one.
  if exists (select 1 from public.reports r where r.reporter_id = caller and r.subject_type = submit_report.subject_type
      and r.subject_id = submit_report.subject_id and r.status = 'open') then
    raise exception 'you already reported this' using errcode = '23505';
  end if;
  insert into public.reports (subject_type, subject_id, reason, details, reporter_id, claimant_name, claimant_email, good_faith)
  values (submit_report.subject_type, submit_report.subject_id, submit_report.reason, trim(details), caller,
    nullif(trim(claimant_name), ''), nullif(lower(trim(claimant_email)), ''), coalesce(good_faith, false))
  returning id into created;
  return created;
exception when check_violation then
  raise exception 'the report is incomplete' using errcode = '22023';
end;
$$;

revoke execute on function public.submit_report(public.report_subject, uuid, public.report_reason, text, text, text, boolean) from public, anon;
grant execute on function public.submit_report(public.report_subject, uuid, public.report_reason, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------

/**
 * Decides an open report: dismiss, or take the content down (release → taken_down, artist →
 * suspended, playlist → private). Closes every open report about the same subject with the same
 * decision. Returns the decision id.
 */
create function public.moderate_report(report uuid, action text, statement text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_report public.reports;
  owner record;
  previous jsonb := '{}'::jsonb;
  decision uuid;
begin
  perform public.require_staff('moderator');
  select * into open_report from public.reports r where r.id = report for update;
  if open_report.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if open_report.status <> 'open' then
    raise exception 'this report was already decided' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(statement), '')) < 20 then
    raise exception 'a statement of reasons needs at least 20 characters' using errcode = '22023';
  end if;
  if action not in ('dismiss', 'takedown_release', 'suspend_artist', 'hide_playlist')
     or (action = 'takedown_release' and open_report.subject_type <> 'release')
     or (action = 'suspend_artist' and open_report.subject_type <> 'artist')
     or (action = 'hide_playlist' and open_report.subject_type <> 'playlist') then
    raise exception 'this action does not fit the reported content' using errcode = '22023';
  end if;

  select * into owner from private.report_subject_owner(open_report.subject_type, open_report.subject_id);

  if action = 'takedown_release' then
    select jsonb_build_object('status', r.status) into previous from public.releases r where r.id = open_report.subject_id;
    update public.releases r set status = 'taken_down' where r.id = open_report.subject_id;
  elsif action = 'suspend_artist' then
    select jsonb_build_object('status', a.status) into previous from public.artists a where a.id = open_report.subject_id;
    update public.artists a set status = 'suspended' where a.id = open_report.subject_id;
  elsif action = 'hide_playlist' then
    select jsonb_build_object('visibility', p.visibility) into previous from public.playlists p where p.id = open_report.subject_id;
    update public.playlists p set visibility = 'private' where p.id = open_report.subject_id;
  end if;

  insert into public.moderation_decisions (subject_type, subject_id, artist_id, owner_id, action, reason, statement,
    previous_state, decided_by)
  values (open_report.subject_type, open_report.subject_id, owner.artist_id, owner.owner_id, action, open_report.reason,
    trim(statement), previous, (select auth.uid()))
  returning id into decision;

  update public.reports r
  set status = case when action = 'dismiss' then 'dismissed' else 'actioned' end, decision_id = decision
  where r.subject_type = open_report.subject_type and r.subject_id = open_report.subject_id and r.status = 'open';

  perform private.write_audit('moderation.' || action, open_report.subject_type::text, open_report.subject_id::text,
    previous, jsonb_build_object('decision', decision, 'report', report, 'reason', open_report.reason));
  return decision;
end;
$$;

/** The affected artist (owner/manager) or playlist owner appeals a decision, once. */
create function public.appeal_moderation_decision(decision uuid, appeal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.moderation_decisions;
begin
  select * into d from public.moderation_decisions m where m.id = decision for update;
  if d.id is null or d.action = 'dismiss' then
    raise exception 'decision not found' using errcode = 'P0002';
  end if;
  if not (d.owner_id = (select auth.uid())
      or (d.artist_id is not null and public.is_artist_member(d.artist_id, array['owner', 'manager']::public.artist_member_role[]))) then
    raise exception 'only the affected owner can appeal' using errcode = '42501';
  end if;
  if d.appeal_status <> 'none' then
    raise exception 'this decision was already appealed' using errcode = '55000';
  end if;
  if d.decided_at < now() - interval '6 months' then
    raise exception 'the appeal period has ended' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(appeal), '')) < 10 then
    raise exception 'an appeal needs at least 10 characters' using errcode = '22023';
  end if;
  update public.moderation_decisions m
  set appeal_text = trim(appeal), appealed_at = now(), appeal_status = 'pending'
  where m.id = decision;
  perform private.write_audit('moderation.appeal', d.subject_type::text, d.subject_id::text, null,
    jsonb_build_object('decision', decision));
end;
$$;

/** Another moderator decides the appeal: uphold, or reverse (the content comes back). */
create function public.decide_appeal(decision uuid, outcome text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.moderation_decisions;
begin
  perform public.require_staff('moderator');
  select * into d from public.moderation_decisions m where m.id = decision for update;
  if d.id is null then
    raise exception 'decision not found' using errcode = 'P0002';
  end if;
  if d.appeal_status <> 'pending' then
    raise exception 'there is no pending appeal' using errcode = '55000';
  end if;
  if d.decided_by = (select auth.uid()) then
    raise exception 'a different moderator must decide the appeal' using errcode = '42501';
  end if;
  if outcome not in ('uphold', 'reverse') then
    raise exception 'outcome must be uphold or reverse' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(note), '')) < 20 then
    raise exception 'the appeal decision needs reasons of at least 20 characters' using errcode = '22023';
  end if;

  if outcome = 'reverse' then
    if d.action = 'takedown_release' then
      update public.releases r set status = (d.previous_state ->> 'status')::public.release_status
      where r.id = d.subject_id and r.status = 'taken_down';
    elsif d.action = 'suspend_artist' then
      update public.artists a set status = (d.previous_state ->> 'status')::public.artist_status
      where a.id = d.subject_id and a.status = 'suspended';
    elsif d.action = 'hide_playlist' then
      update public.playlists p set visibility = (d.previous_state ->> 'visibility')::public.playlist_visibility
      where p.id = d.subject_id;
    end if;
  end if;

  update public.moderation_decisions m
  set appeal_status = case outcome when 'uphold' then 'upheld' else 'reversed' end,
      appeal_note = trim(note), appeal_decided_by = (select auth.uid()), appeal_decided_at = now()
  where m.id = decision;
  perform private.write_audit('moderation.appeal_' || outcome, d.subject_type::text, d.subject_id::text, null,
    jsonb_build_object('decision', decision));
end;
$$;

/** Repeat-infringer signal for moderators: upheld copyright takedowns of an artist. */
create function public.artist_copyright_strikes(artist uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_staff() then (
    select count(*)::integer from public.moderation_decisions d
    where d.artist_id = artist and d.reason = 'copyright' and d.action <> 'dismiss'
      and d.appeal_status <> 'reversed'
  ) end;
$$;

revoke execute on function public.moderate_report(uuid, text, text) from public, anon;
revoke execute on function public.appeal_moderation_decision(uuid, text) from public, anon;
revoke execute on function public.decide_appeal(uuid, text, text) from public, anon;
revoke execute on function public.artist_copyright_strikes(uuid) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
grant execute on function public.appeal_moderation_decision(uuid, text) to authenticated;
grant execute on function public.decide_appeal(uuid, text, text) to authenticated;
grant execute on function public.artist_copyright_strikes(uuid) to authenticated;
