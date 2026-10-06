-- Plans and entitlements (M9.1, docs/promotions.md §1–2). The only source of truth for Premium:
-- the web app asks the database which tiers a listener may stream and never infers a plan from the
-- client. Entitlements are never deleted — revocation keeps the row, the reason and who did it.

create type public.entitlement_source as enum ('promo', 'beta', 'admin', 'referral', 'subscription');

/** Data, not code: a new plan is a row. `rank` orders plans when several are active. */
create table public.plans (
  code text primary key constraint plans_code_format check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null,
  rank integer not null unique,
  max_quality_tier public.quality_tier not null,
  features jsonb not null default '[]'::jsonb
);

insert into public.plans (code, name, rank, max_quality_tier, features) values
  ('free', 'Free', 0, 'high', '[]'),
  ('premium', 'Premium', 1, 'hires', '["lossless", "hires"]');

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.plans (code),
  source public.entitlement_source not null,
  -- What granted it, for the user and for support: a campaign name, "beta 2026", an admin note.
  source_ref text constraint entitlements_source_ref_length check (char_length(source_ref) <= 120),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint entitlements_period check (ends_at is null or ends_at > starts_at),
  constraint entitlements_revocation check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_at is not null and char_length(revoked_reason) between 5 and 500)
  )
);

create index entitlements_user_idx on public.entitlements (user_id, plan_code, starts_at);

alter table public.plans enable row level security;
alter table public.entitlements enable row level security;

create policy plans_read on public.plans for select to anon, authenticated using (true);
create policy entitlements_read_own on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()));
-- Admins (with MFA) look entitlements up for support and revocation.
create policy entitlements_read_admin on public.entitlements for select to authenticated
  using ((select public.has_app_role('admin')) and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2');

revoke all on public.plans, public.entitlements from anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- Effective plan
-- ---------------------------------------------------------------------------

/**
 * The user's effective plan now: the highest-ranked plan with an active entitlement, else free.
 * `ends_at` follows back-to-back entitlements of that plan (stacked codes), null = for life.
 */
create function private.effective_plan(target uuid)
returns table (plan_code text, ends_at timestamptz, source public.entitlement_source, source_ref text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_entitlement public.entitlements;
  horizon timestamptz;
  next_end timestamptz;
  lifetime boolean;
begin
  select e.* into current_entitlement
  from public.entitlements e
  join public.plans p on p.code = e.plan_code
  where e.user_id = target and e.revoked_at is null
    and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
  order by p.rank desc, e.ends_at desc nulls first
  limit 1;

  if current_entitlement.id is null then
    return query select 'free'::text, null::timestamptz, null::public.entitlement_source, null::text;
    return;
  end if;

  select exists (
    select 1 from public.entitlements e
    where e.user_id = target and e.plan_code = current_entitlement.plan_code
      and e.revoked_at is null and e.starts_at <= now() and e.ends_at is null
  ) into lifetime;

  if not lifetime then
    horizon := now();
    loop
      select max(e.ends_at) into next_end
      from public.entitlements e
      where e.user_id = target and e.plan_code = current_entitlement.plan_code
        and e.revoked_at is null and e.starts_at <= horizon and e.ends_at > horizon;
      exit when next_end is null;
      horizon := next_end;
    end loop;
  end if;

  return query select current_entitlement.plan_code,
    case when lifetime then null else horizon end,
    current_entitlement.source, current_entitlement.source_ref;
end;
$$;

revoke execute on function private.effective_plan(uuid) from public, anon, authenticated;

/** The caller's plan (anonymous listeners are on free) with what it unlocks. */
create function public.my_plan()
returns table (
  plan_code text,
  plan_name text,
  max_quality_tier public.quality_tier,
  ends_at timestamptz,
  source public.entitlement_source,
  source_ref text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.name, p.max_quality_tier, e.ends_at, e.source, e.source_ref
  from private.effective_plan((select auth.uid())) e
  join public.plans p on p.code = e.plan_code;
$$;

revoke execute on function public.my_plan() from public;
grant execute on function public.my_plan() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Granting (shared by admin grants, beta and — in M9.2 — promo codes)
-- ---------------------------------------------------------------------------

/**
 * Grants `plan` for `duration` (null = for life). A time-limited grant starts when the user's
 * current run of that plan ends, so stacked grants add time instead of overlapping.
 * Raises `already_lifetime` (P0001, hint) when the user already has that plan for life.
 */
create function private.grant_entitlement(
  target uuid,
  plan text,
  duration interval,
  source public.entitlement_source,
  source_ref text,
  granted_by uuid
)
returns public.entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz := now();
  horizon timestamptz;
  granted public.entitlements;
begin
  if not exists (select 1 from public.plans p where p.code = plan and p.code <> 'free') then
    raise exception 'unknown plan %', plan using errcode = 'P0002';
  end if;
  -- Serialize grants per user so two concurrent grants cannot both start "now".
  perform pg_advisory_xact_lock(hashtextextended('entitlements:' || target::text, 0));

  if exists (
    select 1 from public.entitlements e
    where e.user_id = target and e.plan_code = plan and e.revoked_at is null
      and e.starts_at <= now() and e.ends_at is null
  ) then
    raise exception 'already has % for life', plan using errcode = 'P0001', hint = 'already_lifetime';
  end if;

  if duration is not null then
    horizon := now();
    loop
      select max(e.ends_at) into start_at
      from public.entitlements e
      where e.user_id = target and e.plan_code = plan and e.revoked_at is null
        and e.starts_at <= horizon and e.ends_at > horizon;
      exit when start_at is null;
      horizon := start_at;
    end loop;
    start_at := horizon;
  end if;

  insert into public.entitlements (user_id, plan_code, source, source_ref, starts_at, ends_at, granted_by)
  values (target, plan, grant_entitlement.source, grant_entitlement.source_ref, start_at,
    case when duration is null then null else start_at + duration end, grant_entitlement.granted_by)
  returning * into granted;

  perform private.write_audit('entitlement.grant', 'user', target::text, null,
    jsonb_build_object('entitlement', granted.id, 'plan', plan, 'source', grant_entitlement.source,
      'source_ref', grant_entitlement.source_ref, 'starts_at', granted.starts_at, 'ends_at', granted.ends_at));
  return granted;
end;
$$;

revoke execute on function private.grant_entitlement(uuid, text, interval, public.entitlement_source, text, uuid)
  from public, anon, authenticated;

/** Admin (with MFA) grants a plan for `days` days, or for life when `days` is null. */
create function public.admin_grant_entitlement(target_user uuid, plan text, days integer, note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  if days is not null and days not between 1 and 3660 then
    raise exception 'days must be between 1 and 3660' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(note), '')) not between 3 and 120 then
    raise exception 'a note (3–120 characters) is required' using errcode = '22023';
  end if;
  return (private.grant_entitlement(target_user, plan,
    case when days is null then null else make_interval(days => days) end,
    'admin', trim(note), (select auth.uid()))).id;
end;
$$;

/** Admin (with MFA) revokes an entitlement with a reason; the row stays. */
create function public.admin_revoke_entitlement(entitlement uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.entitlements;
begin
  perform public.require_staff('admin');
  if char_length(coalesce(trim(reason), '')) not between 5 and 500 then
    raise exception 'a reason (5–500 characters) is required' using errcode = '22023';
  end if;
  select * into previous from public.entitlements e where e.id = entitlement for update;
  if previous.id is null then
    raise exception 'entitlement not found' using errcode = 'P0002';
  end if;
  if previous.revoked_at is not null then
    return;
  end if;
  update public.entitlements e
  set revoked_at = now(), revoked_reason = trim(reason), revoked_by = (select auth.uid())
  where e.id = entitlement;
  perform private.write_audit('entitlement.revoke', 'user', previous.user_id::text,
    jsonb_build_object('entitlement', entitlement, 'plan', previous.plan_code, 'ends_at', previous.ends_at),
    jsonb_build_object('reason', trim(reason)));
end;
$$;

/** Server-side bootstrap (secret key only): `scripts/grant-plan.mjs`, beta testers, E2E. */
create function public.system_grant_entitlement(
  target_email text,
  plan text,
  days integer,
  source public.entitlement_source,
  note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select u.id into target from auth.users u where lower(u.email) = lower(target_email);
  if target is null then
    raise exception 'no user with this email' using errcode = 'P0002';
  end if;
  return (private.grant_entitlement(target, plan,
    case when days is null then null else make_interval(days => days) end,
    system_grant_entitlement.source, note, null)).id;
end;
$$;

revoke execute on function public.admin_grant_entitlement(uuid, text, integer, text) from public, anon;
revoke execute on function public.admin_revoke_entitlement(uuid, text) from public, anon;
grant execute on function public.admin_grant_entitlement(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_revoke_entitlement(uuid, text) to authenticated;
revoke execute on function public.system_grant_entitlement(text, text, integer, public.entitlement_source, text)
  from public, anon, authenticated;
grant execute on function public.system_grant_entitlement(text, text, integer, public.entitlement_source, text)
  to service_role;
