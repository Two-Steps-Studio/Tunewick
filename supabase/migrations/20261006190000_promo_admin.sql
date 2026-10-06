-- Promo admin (M9.3, docs/promotions.md §5): admin role + MFA, every change audited.
-- Codes stay hashed: plaintext exists only in the response that generated it.

create function public.admin_create_promo_campaign(
  name text,
  description text default null,
  partner text default null,
  starts_at timestamptz default null,
  ends_at timestamptz default null,
  max_redemptions_total integer default null,
  per_user_limit integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  perform public.require_staff('admin');
  insert into public.promo_campaigns (name, description, partner, starts_at, ends_at,
    max_redemptions_total, per_user_limit, created_by)
  values (trim(admin_create_promo_campaign.name), nullif(trim(admin_create_promo_campaign.description), ''),
    nullif(trim(admin_create_promo_campaign.partner), ''), admin_create_promo_campaign.starts_at,
    admin_create_promo_campaign.ends_at, admin_create_promo_campaign.max_redemptions_total,
    coalesce(admin_create_promo_campaign.per_user_limit, 1), (select auth.uid()))
  returning id into created;
  perform private.write_audit('promo.campaign_created', 'promo_campaign', created::text, null,
    jsonb_build_object('name', trim(admin_create_promo_campaign.name), 'partner', admin_create_promo_campaign.partner,
      'starts_at', admin_create_promo_campaign.starts_at, 'ends_at', admin_create_promo_campaign.ends_at,
      'max_redemptions_total', admin_create_promo_campaign.max_redemptions_total));
  return created;
end;
$$;

create function public.admin_set_promo_campaign_active(campaign uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous boolean;
begin
  perform public.require_staff('admin');
  select c.active into previous from public.promo_campaigns c where c.id = campaign for update;
  if previous is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  update public.promo_campaigns c set active = admin_set_promo_campaign_active.active where c.id = campaign;
  perform private.write_audit('promo.campaign_active', 'promo_campaign', campaign::text,
    jsonb_build_object('active', previous), jsonb_build_object('active', admin_set_promo_campaign_active.active));
end;
$$;

/** Codes of a campaign (hint only — the code itself is never stored), optionally by hint. */
create function public.admin_list_promo_codes(campaign uuid, hint text default null)
returns table (
  id uuid,
  code_hint text,
  shared boolean,
  benefit_type public.promo_benefit,
  benefit_value integer,
  max_uses integer,
  uses_count integer,
  starts_at timestamptz,
  expires_at timestamptz,
  eligibility jsonb,
  active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
    select c.id, c.code_hint, c.shared, c.benefit_type, c.benefit_value, c.max_uses, c.uses_count,
      c.starts_at, c.expires_at, c.eligibility, c.active, c.created_at
    from private.promo_codes c
    where c.campaign_id = campaign
      and (hint is null or c.code_hint = upper(right(regexp_replace(hint, '[^A-Za-z0-9]', '', 'g'), 4)))
    order by c.shared desc, c.created_at desc, c.code_hint
    limit 500;
end;
$$;

/** Generates unique single-use codes; the plaintext is returned once (export it as CSV). */
create function public.admin_generate_promo_codes(
  campaign uuid,
  how_many integer,
  benefit_type public.promo_benefit,
  benefit_value integer,
  expires_at timestamptz default null,
  new_accounts_days integer default null
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  if not exists (select 1 from public.promo_campaigns c where c.id = campaign) then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  return query select * from private.generate_promo_codes(campaign, how_many, benefit_type, benefit_value,
    expires_at,
    case when new_accounts_days is null then '{}'::jsonb else jsonb_build_object('new_accounts_days', new_accounts_days) end,
    (select auth.uid()));
end;
$$;

/** A human-readable shared code (posters, flyers) capped by `max_uses`, once per account. */
create function public.admin_create_shared_promo_code(
  campaign uuid,
  code text,
  benefit_type public.promo_benefit,
  benefit_value integer,
  max_uses integer,
  expires_at timestamptz default null,
  new_accounts_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  perform public.require_staff('admin');
  if not exists (select 1 from public.promo_campaigns c where c.id = campaign) then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if max_uses is null then
    raise exception 'a shared code needs a maximum number of uses' using errcode = '22023';
  end if;
  created := private.insert_promo_code(campaign, code, true, benefit_type, benefit_value, max_uses, 1, null,
    expires_at,
    case when new_accounts_days is null then '{}'::jsonb else jsonb_build_object('new_accounts_days', new_accounts_days) end,
    (select auth.uid()));
  perform private.write_audit('promo.shared_code_created', 'promo_campaign', campaign::text, null,
    jsonb_build_object('code', created, 'hint', right(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 4),
      'benefit_type', benefit_type, 'benefit_value', benefit_value, 'max_uses', max_uses, 'expires_at', expires_at));
  return created;
end;
$$;

create function public.admin_set_promo_code_active(code uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous private.promo_codes;
begin
  perform public.require_staff('admin');
  select * into previous from private.promo_codes c where c.id = code for update;
  if previous.id is null then
    raise exception 'code not found' using errcode = 'P0002';
  end if;
  update private.promo_codes c set active = admin_set_promo_code_active.active where c.id = code;
  perform private.write_audit('promo.code_active', 'promo_campaign', previous.campaign_id::text,
    jsonb_build_object('code', code, 'hint', previous.code_hint, 'active', previous.active),
    jsonb_build_object('active', admin_set_promo_code_active.active));
end;
$$;

/** Redemptions of a campaign, newest first, with who (public handle) and what was granted. */
create function public.admin_list_promo_redemptions(campaign uuid)
returns table (
  id uuid,
  code_hint text,
  user_id uuid,
  handle text,
  display_name text,
  redeemed_at timestamptz,
  status text,
  entitlement_id uuid,
  ends_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
    select r.id, c.code_hint, r.user_id, p.handle::text, p.display_name, r.redeemed_at, r.status,
      e.id, e.ends_at, e.revoked_at
    from public.promo_redemptions r
    join private.promo_codes c on c.id = r.code_id
    left join public.profiles p on p.id = r.user_id
    left join public.entitlements e on e.id = r.entitlement_id
    where r.campaign_id = campaign
    order by r.redeemed_at desc
    limit 500;
end;
$$;

/** Revokes what a redemption granted (abuse, partner error). The redemption row stays. */
create function public.admin_revoke_promo_redemption(redemption uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.promo_redemptions;
begin
  perform public.require_staff('admin');
  if char_length(coalesce(trim(reason), '')) not between 5 and 500 then
    raise exception 'a reason (5–500 characters) is required' using errcode = '22023';
  end if;
  select * into previous from public.promo_redemptions r where r.id = redemption for update;
  if previous.id is null then
    raise exception 'redemption not found' using errcode = 'P0002';
  end if;
  if previous.status = 'revoked' then
    return;
  end if;
  if previous.entitlement_id is not null then
    perform public.admin_revoke_entitlement(previous.entitlement_id, reason);
  end if;
  update public.promo_redemptions r set status = 'revoked' where r.id = redemption;
  perform private.write_audit('promo.redemption_revoked', 'user', previous.user_id::text,
    jsonb_build_object('redemption', redemption, 'campaign', previous.campaign_id),
    jsonb_build_object('reason', trim(reason)));
end;
$$;

revoke execute on function public.admin_create_promo_campaign(text, text, text, timestamptz, timestamptz, integer, integer) from public, anon;
revoke execute on function public.admin_set_promo_campaign_active(uuid, boolean) from public, anon;
revoke execute on function public.admin_list_promo_codes(uuid, text) from public, anon;
revoke execute on function public.admin_generate_promo_codes(uuid, integer, public.promo_benefit, integer, timestamptz, integer) from public, anon;
revoke execute on function public.admin_create_shared_promo_code(uuid, text, public.promo_benefit, integer, integer, timestamptz, integer) from public, anon;
revoke execute on function public.admin_set_promo_code_active(uuid, boolean) from public, anon;
revoke execute on function public.admin_list_promo_redemptions(uuid) from public, anon;
revoke execute on function public.admin_revoke_promo_redemption(uuid, text) from public, anon;
grant execute on function public.admin_create_promo_campaign(text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.admin_set_promo_campaign_active(uuid, boolean) to authenticated;
grant execute on function public.admin_list_promo_codes(uuid, text) to authenticated;
grant execute on function public.admin_generate_promo_codes(uuid, integer, public.promo_benefit, integer, timestamptz, integer) to authenticated;
grant execute on function public.admin_create_shared_promo_code(uuid, text, public.promo_benefit, integer, integer, timestamptz, integer) to authenticated;
grant execute on function public.admin_set_promo_code_active(uuid, boolean) to authenticated;
grant execute on function public.admin_list_promo_redemptions(uuid) to authenticated;
grant execute on function public.admin_revoke_promo_redemption(uuid, text) to authenticated;
