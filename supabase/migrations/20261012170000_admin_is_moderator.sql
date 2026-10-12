-- Admins can do everything moderators can. The app already treats them so (public.is_staff(),
-- requireStaff in the web app), but staff functions check public.has_app_role('moderator') via
-- require_staff, which matched the exact role only — an admin saw the moderation queue and was
-- then refused every decision. Roles stay separate rows: a moderator still isn't an admin.

create or replace function public.has_app_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and (ur.role = required or (required = 'moderator' and ur.role = 'admin'))
  );
$$;
