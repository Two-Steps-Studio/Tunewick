-- Feature flags + closed-beta access invites (decision D5).
-- The invite gate is enforced by a trigger on auth.users, so it also applies to sign-ups that
-- call the public Auth API directly. See docs/security.md and Guidon task M1.4.

-- ---------------------------------------------------------------------------
-- Feature flags (server-side evaluation; no direct table access for clients)
-- ---------------------------------------------------------------------------
create table public.feature_flags (
  key text primary key constraint feature_flags_key_format check (key ~ '^[a-z0-9_]{2,60}$'),
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function private.set_updated_at();

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;

create function public.is_feature_enabled(flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = flag), false);
$$;

revoke execute on function public.is_feature_enabled(text) from public;
grant execute on function public.is_feature_enabled(text) to anon, authenticated, service_role;

insert into public.feature_flags (key, enabled, description)
values ('closed_beta', true, 'Sign-up requires an access invite (decision D5: closed GZM beta).');

-- ---------------------------------------------------------------------------
-- Access invites (codes stored only as SHA-256 of the normalized code)
-- ---------------------------------------------------------------------------
create function private.hash_invite_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'),
    'hex'
  );
$$;

create table private.access_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  max_uses integer not null default 1 constraint access_invites_max_uses check (max_uses > 0),
  uses_count integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint access_invites_uses check (uses_count between 0 and max_uses)
);

-- Friendly pre-check for the sign-up form. Enforcement happens in the trigger below.
create function public.access_invite_is_valid(code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.access_invites i
    where i.code_hash = private.hash_invite_code(code)
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
      and i.uses_count < i.max_uses
  );
$$;

revoke execute on function public.access_invite_is_valid(text) from public;
grant execute on function public.access_invite_is_valid(text) to anon, authenticated;

-- Creating invites is a server-side operation (secret key); returns how many were stored.
create function public.create_access_invites(
  codes text[],
  max_uses integer default 1,
  expires_at timestamptz default null,
  label text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into private.access_invites (code_hash, max_uses, expires_at, label)
  select private.hash_invite_code(c), create_access_invites.max_uses,
         create_access_invites.expires_at, create_access_invites.label
  from unnest(codes) as c;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.create_access_invites(text[], integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.create_access_invites(text[], integer, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Gate: validate and consume the invite before the auth user row is written.
-- Bypass only via app_metadata.beta_bypass, which the public Auth API cannot set.
-- ---------------------------------------------------------------------------
create function private.enforce_access_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_code text := new.raw_user_meta_data ->> 'invite_code';
  invite_id uuid;
begin
  -- The plaintext code never stays in user metadata.
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';

  if not public.is_feature_enabled('closed_beta')
     or coalesce(new.raw_app_meta_data ->> 'beta_bypass', '') = 'true' then
    return new;
  end if;

  -- Single statement: row lock + re-check makes concurrent use of the last slot safe.
  update private.access_invites i
  set uses_count = i.uses_count + 1
  where i.code_hash = private.hash_invite_code(invite_code)
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.uses_count < i.max_uses
  returning i.id into invite_id;

  if invite_id is null then
    raise exception 'A valid access invite is required during the closed beta'
      using errcode = 'P0001', hint = 'invalid_access_invite';
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('access_invite_id', invite_id);
  return new;
end;
$$;

create trigger enforce_access_invite
  before insert on auth.users
  for each row execute function private.enforce_access_invite();
