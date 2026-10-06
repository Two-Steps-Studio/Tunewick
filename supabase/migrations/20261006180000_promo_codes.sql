-- Promo codes (M9.2, docs/promotions.md §3–5). Codes are never stored in plaintext: HMAC-SHA256
-- with a pepper that is generated inside each database (Supabase Vault) and never leaves it.
-- Redemption is one transaction behind one function; every attempt is recorded for rate limiting.

create type public.promo_benefit as enum (
  'premium_days', 'premium_months', 'premium_lifetime', 'feature_access', 'percent_discount', 'fixed_discount'
);

-- The pepper: random per environment, created here (not in the repo), readable only by
-- security definer functions of this schema.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'promo_code_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'promo_code_pepper',
      'HMAC pepper for promo codes (M9.2). Rotating it invalidates every code.');
  end if;
end;
$$;

create function private.promo_code_hash(code text)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.hmac(
    convert_to(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8'),
    convert_to((select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'promo_code_pepper'), 'UTF8'),
    'sha256');
$$;

revoke execute on function private.promo_code_hash(text) from public, anon, authenticated;

create table public.promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique constraint promo_campaigns_name_length check (char_length(name) between 3 and 80),
  description text constraint promo_campaigns_description_length check (char_length(description) <= 500),
  partner text constraint promo_campaigns_partner_length check (char_length(partner) <= 120),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  max_redemptions_total integer constraint promo_campaigns_max_total check (max_redemptions_total > 0),
  redemptions_count integer not null default 0,
  -- How many codes of this campaign one account may redeem (posters + flyers → still one).
  per_user_limit integer not null default 1 constraint promo_campaigns_per_user check (per_user_limit > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promo_campaigns_period check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table private.promo_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promo_campaigns (id),
  code_hash bytea not null unique,
  code_hint text not null,
  shared boolean not null,
  benefit_type public.promo_benefit not null,
  benefit_value integer,
  benefit_feature text,
  target_plan text not null default 'premium' references public.plans (code),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer constraint promo_codes_max_uses check (max_uses > 0),
  uses_count integer not null default 0,
  per_user_limit integer not null default 1 constraint promo_codes_per_user check (per_user_limit > 0),
  -- {"new_accounts_days": 30} (account at most N days old), {"min_account_age_days": 7}.
  eligibility jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promo_codes_benefit check (
    case benefit_type
      when 'premium_days' then benefit_value between 1 and 3660
      when 'premium_months' then benefit_value between 1 and 120
      when 'premium_lifetime' then benefit_value is null
      when 'feature_access' then benefit_feature is not null and benefit_value between 1 and 3660
      when 'percent_discount' then benefit_value between 1 and 100
      when 'fixed_discount' then benefit_value > 0
    end
  ),
  constraint promo_codes_period check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index promo_codes_campaign_idx on private.promo_codes (campaign_id);
create index promo_codes_hint_idx on private.promo_codes (code_hint);

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references private.promo_codes (id),
  campaign_id uuid not null references public.promo_campaigns (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement_id uuid references public.entitlements (id),
  redeemed_at timestamptz not null default now(),
  status text not null default 'granted' constraint promo_redemptions_status check (status in ('granted', 'revoked'))
);

create index promo_redemptions_user_idx on public.promo_redemptions (user_id, code_id);
create index promo_redemptions_campaign_idx on public.promo_redemptions (campaign_id, redeemed_at);

create table private.promo_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_id uuid references private.promo_codes (id),
  result text not null,
  attempted_at timestamptz not null default now()
);

create index promo_attempts_user_idx on private.promo_attempts (user_id, attempted_at desc);

alter table public.promo_campaigns enable row level security;
alter table public.promo_redemptions enable row level security;

create policy promo_campaigns_read_admin on public.promo_campaigns for select to authenticated
  using ((select public.has_app_role('admin')) and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2');
create policy promo_redemptions_read_own on public.promo_redemptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy promo_redemptions_read_admin on public.promo_redemptions for select to authenticated
  using ((select public.has_app_role('admin')) and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2');

revoke all on public.promo_campaigns, public.promo_redemptions from anon, authenticated;
grant select on public.promo_campaigns, public.promo_redemptions to authenticated;

-- ---------------------------------------------------------------------------
-- Creating codes
-- ---------------------------------------------------------------------------

/** A unique single-use code: 16 characters without look-alikes, ~79 bits, XXXX-XXXX-XXXX-XXXX. */
create function private.generate_promo_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i integer := 0;
  b integer;
begin
  while char_length(result) < 16 loop
    if i % 32 = 0 then
      bytes := extensions.gen_random_bytes(32);
    end if;
    b := get_byte(bytes, i % 32);
    i := i + 1;
    -- Rejection sampling keeps every character equally likely (248 = 8 × 31).
    if b < 248 then
      result := result || substr(alphabet, b % 31 + 1, 1);
    end if;
  end loop;
  return substr(result, 1, 4) || '-' || substr(result, 5, 4) || '-' || substr(result, 9, 4) || '-' || substr(result, 13, 4);
end;
$$;

create function private.insert_promo_code(
  campaign uuid,
  code text,
  shared boolean,
  benefit_type public.promo_benefit,
  benefit_value integer,
  max_uses integer,
  per_user_limit integer,
  starts_at timestamptz,
  expires_at timestamptz,
  eligibility jsonb,
  created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  inserted uuid;
begin
  if char_length(normalized) < 6 then
    raise exception 'a code needs at least 6 letters or digits' using errcode = '22023';
  end if;
  insert into private.promo_codes (campaign_id, code_hash, code_hint, shared, benefit_type, benefit_value,
    max_uses, per_user_limit, starts_at, expires_at, eligibility, created_by)
  values (campaign, private.promo_code_hash(normalized), right(normalized, 4), shared,
    insert_promo_code.benefit_type, insert_promo_code.benefit_value, insert_promo_code.max_uses,
    coalesce(insert_promo_code.per_user_limit, 1), insert_promo_code.starts_at, insert_promo_code.expires_at,
    coalesce(insert_promo_code.eligibility, '{}'::jsonb), insert_promo_code.created_by)
  returning id into inserted;
  return inserted;
exception when unique_violation then
  raise exception 'this code already exists' using errcode = '23505';
end;
$$;

/** Generates `how_many` unique single-use codes. The plaintext is returned once, never stored. */
create function private.generate_promo_codes(
  campaign uuid,
  how_many integer,
  benefit_type public.promo_benefit,
  benefit_value integer,
  expires_at timestamptz,
  eligibility jsonb,
  created_by uuid
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if how_many not between 1 and 5000 then
    raise exception 'between 1 and 5000 codes per batch' using errcode = '22023';
  end if;
  for n in 1..how_many loop
    code := private.generate_promo_code();
    perform private.insert_promo_code(campaign, code, false, benefit_type, benefit_value, 1, 1, null,
      expires_at, eligibility, created_by);
    return next code;
  end loop;
  perform private.write_audit('promo.codes_generated', 'promo_campaign', campaign::text, null,
    jsonb_build_object('count', how_many, 'benefit_type', benefit_type, 'benefit_value', benefit_value,
      'expires_at', expires_at));
end;
$$;

revoke execute on function private.generate_promo_code() from public, anon, authenticated;
revoke execute on function private.insert_promo_code(uuid, text, boolean, public.promo_benefit, integer, integer, integer, timestamptz, timestamptz, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function private.generate_promo_codes(uuid, integer, public.promo_benefit, integer, timestamptz, jsonb, uuid)
  from public, anon, authenticated;

/**
 * Server-side (secret key) code creation for bootstrap, beta and tests —
 * `scripts/create-promo-codes.mjs`. Creates the campaign when it does not exist yet.
 * With `shared_code` it creates one human-readable code (max_uses caps it); otherwise `how_many`
 * unique single-use codes, returned once.
 */
create function public.system_create_promo_codes(
  campaign_name text,
  benefit_type public.promo_benefit,
  benefit_value integer,
  how_many integer default 1,
  shared_code text default null,
  max_uses integer default null,
  expires_at timestamptz default null,
  eligibility jsonb default '{}'::jsonb
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign uuid;
begin
  select c.id into campaign from public.promo_campaigns c where c.name = campaign_name;
  if campaign is null then
    insert into public.promo_campaigns (name) values (campaign_name) returning id into campaign;
    perform private.write_audit('promo.campaign_created', 'promo_campaign', campaign::text, null,
      jsonb_build_object('name', campaign_name));
  end if;
  if shared_code is not null then
    perform private.insert_promo_code(campaign, shared_code, true, benefit_type, benefit_value, max_uses, 1,
      null, expires_at, eligibility, null);
    perform private.write_audit('promo.shared_code_created', 'promo_campaign', campaign::text, null,
      jsonb_build_object('hint', right(upper(regexp_replace(shared_code, '[^A-Za-z0-9]', '', 'g')), 4),
        'benefit_type', benefit_type, 'benefit_value', benefit_value, 'max_uses', max_uses));
    return next upper(shared_code);
    return;
  end if;
  return query select * from private.generate_promo_codes(campaign, how_many, benefit_type, benefit_value,
    expires_at, eligibility, null);
end;
$$;

revoke execute on function public.system_create_promo_codes(text, public.promo_benefit, integer, integer, text, integer, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_create_promo_codes(text, public.promo_benefit, integer, integer, text, integer, timestamptz, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Redemption (promotions.md §4)
-- ---------------------------------------------------------------------------

/**
 * Redeems a code for the caller. Returns `{status, plan, ends_at}`; status is one of granted,
 * invalid, inactive, expired, not_yet_valid, not_eligible, exhausted, already_redeemed,
 * already_lifetime, unavailable, rate_limited. Failures are results, not exceptions, so every
 * attempt is recorded for rate limiting. Only `granted` changes anything.
 */
create function public.redeem_promo_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  account auth.users;
  promo private.promo_codes;
  campaign public.promo_campaigns;
  outcome text;
  duration interval;
  granted public.entitlements;
  plan record;
begin
  if caller is null then
    raise exception 'sign in to redeem a code' using errcode = '42501';
  end if;
  -- One redemption at a time per account (attempt counting, campaign limits).
  perform pg_advisory_xact_lock(hashtextextended('promo:' || caller::text, 0));

  -- 0. Verified email and rate limit: 10 failed attempts per 15 minutes.
  select * into account from auth.users u where u.id = caller;
  if (select count(*) from private.promo_attempts a
      where a.user_id = caller and a.attempted_at > now() - interval '15 minutes'
        and a.result not in ('granted', 'already_redeemed', 'already_lifetime')) >= 10 then
    insert into private.promo_attempts (user_id, result) values (caller, 'rate_limited');
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 1. Exists?
  select * into promo from private.promo_codes c where c.code_hash = private.promo_code_hash(code) for update;
  if promo.id is null then
    insert into private.promo_attempts (user_id, result) values (caller, 'invalid');
    return jsonb_build_object('status', 'invalid');
  end if;
  -- 2. (The row lock above serializes redemptions of this code.) Active?
  select * into campaign from public.promo_campaigns c where c.id = promo.campaign_id for update;

  outcome := case
    when not promo.active or not campaign.active then 'inactive'
    -- 3. Within dates?
    when coalesce(promo.starts_at, '-infinity') > now() or coalesce(campaign.starts_at, '-infinity') > now() then 'not_yet_valid'
    when coalesce(promo.expires_at, 'infinity') <= now() or coalesce(campaign.ends_at, 'infinity') <= now() then 'expired'
    -- 6. Per-user limits (checked before the global limit: a retry of a successful redemption
    --    of a single-use code says "already redeemed", not "exhausted").
    when (select count(*) from public.promo_redemptions r where r.code_id = promo.id and r.user_id = caller)
      >= promo.per_user_limit then 'already_redeemed'
    -- 7. Campaign rules: N codes per campaign per account.
    when (select count(*) from public.promo_redemptions r where r.campaign_id = campaign.id and r.user_id = caller)
      >= campaign.per_user_limit then 'already_redeemed'
    -- 4. Eligibility.
    when account.email_confirmed_at is null then 'not_eligible'
    when promo.eligibility ? 'new_accounts_days'
      and account.created_at < now() - make_interval(days => (promo.eligibility ->> 'new_accounts_days')::integer) then 'not_eligible'
    when promo.eligibility ? 'min_account_age_days'
      and account.created_at > now() - make_interval(days => (promo.eligibility ->> 'min_account_age_days')::integer) then 'not_eligible'
    -- 5. Usage limits.
    when promo.max_uses is not null and promo.uses_count >= promo.max_uses then 'exhausted'
    when campaign.max_redemptions_total is not null and campaign.redemptions_count >= campaign.max_redemptions_total then 'exhausted'
    -- 8. Grantable now? Discounts need payments (Phase 14); no feature needs feature_access yet.
    when promo.benefit_type in ('percent_discount', 'fixed_discount', 'feature_access') then 'unavailable'
    when exists (select 1 from public.entitlements e
      where e.user_id = caller and e.plan_code = promo.target_plan and e.revoked_at is null
        and e.starts_at <= now() and e.ends_at is null) then 'already_lifetime'
    else null
  end;

  if outcome is not null then
    insert into private.promo_attempts (user_id, code_id, result) values (caller, promo.id, outcome);
    select * into plan from public.my_plan();
    return jsonb_build_object('status', outcome, 'plan', plan.plan_code, 'ends_at', plan.ends_at);
  end if;

  -- 9. Grant atomically.
  duration := case promo.benefit_type
    when 'premium_days' then make_interval(days => promo.benefit_value)
    when 'premium_months' then make_interval(months => promo.benefit_value)
    else null
  end;
  granted := private.grant_entitlement(caller, promo.target_plan, duration, 'promo', campaign.name, null);
  insert into public.promo_redemptions (code_id, campaign_id, user_id, entitlement_id)
  values (promo.id, campaign.id, caller, granted.id);
  update private.promo_codes c set uses_count = c.uses_count + 1 where c.id = promo.id;
  update public.promo_campaigns c set redemptions_count = c.redemptions_count + 1 where c.id = campaign.id;
  insert into private.promo_attempts (user_id, code_id, result) values (caller, promo.id, 'granted');
  perform private.write_audit('promo.redeem', 'user', caller::text, null,
    jsonb_build_object('code', promo.id, 'hint', promo.code_hint, 'campaign', campaign.id, 'entitlement', granted.id));

  select * into plan from public.my_plan();
  return jsonb_build_object('status', 'granted', 'plan', plan.plan_code, 'ends_at', plan.ends_at,
    'benefit_type', promo.benefit_type, 'benefit_value', promo.benefit_value);
end;
$$;

revoke execute on function public.redeem_promo_code(text) from public, anon;
grant execute on function public.redeem_promo_code(text) to authenticated;
