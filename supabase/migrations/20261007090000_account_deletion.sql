-- Account deletion (M11, GDPR art. 17; security.md / database.md retention). A listener can
-- delete their account themselves. Their personal data goes with it (profiles, settings, likes,
-- playlists, history, attendance, entitlements — all cascade). What must stay as evidence stays
-- without the person: rights declarations (legal claims) and the audit log (actor id only).
-- An artist profile never loses its last owner: the sole owner transfers or deletes it first.

-- Rights declarations survive their author's deletion (evidence for the release; who declared
-- is in the audit log as an id).
alter table public.rights_declarations alter column declared_by drop not null;
alter table public.rights_declarations drop constraint rights_declarations_declared_by_fkey;
alter table public.rights_declarations add constraint rights_declarations_declared_by_fkey
  foreign key (declared_by) references auth.users (id) on delete set null;

/** Artist profiles the caller is the only accepted owner of (they block account deletion). */
create function public.my_deletion_blockers()
returns table (artist_id uuid, slug text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug::text, a.name
  from public.artist_members m
  join public.artists a on a.id = m.artist_id
  where m.user_id = (select auth.uid()) and m.role = 'owner' and m.accepted_at is not null
    and not exists (
      select 1 from public.artist_members o
      where o.artist_id = m.artist_id and o.user_id <> m.user_id and o.role = 'owner' and o.accepted_at is not null
    )
  order by a.name;
$$;

/**
 * Deletes the caller's account. The caller types their email to confirm; staff accounts are
 * removed by another admin (roles first). Audited (without personal data).
 */
create function public.delete_my_account(confirm_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  account_email text;
begin
  if caller is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select u.email into account_email from auth.users u where u.id = caller;
  if lower(trim(coalesce(confirm_email, ''))) <> lower(coalesce(account_email, '')) then
    raise exception 'the email does not match this account' using errcode = '22023', hint = 'email_mismatch';
  end if;
  if exists (select 1 from public.user_roles r where r.user_id = caller) then
    raise exception 'staff accounts are removed by an administrator' using errcode = '55000', hint = 'staff';
  end if;
  if exists (select 1 from public.my_deletion_blockers()) then
    raise exception 'transfer or delete your artist profiles first' using errcode = '55000', hint = 'sole_owner';
  end if;
  perform private.write_audit('account.delete', 'user', caller::text, null, null);
  delete from auth.users u where u.id = caller;
end;
$$;

revoke execute on function public.my_deletion_blockers() from public, anon;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.my_deletion_blockers() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
