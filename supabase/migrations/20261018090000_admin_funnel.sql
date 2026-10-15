-- Admin: how new accounts get on (the funnel) and how many people listen (active listeners).
-- Counts only, never who; admin + aal2 (require_staff).

/**
 * Accounts created in the last `days` days and how many of them reached each step: confirmed
 * e-mail, finished onboarding, a real listen (30 s+, not a soundcheck), a like/save/follow, and
 * a listen on a later day than the sign-up (came back).
 */
create function public.admin_funnel(days integer default 30)
returns table (step text, accounts integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
  with cohort as (
    select u.id, u.created_at, u.email_confirmed_at
    from auth.users u
    where u.created_at >= now() - make_interval(days => greatest(1, least(admin_funnel.days, 365)))
  ),
  steps as (
    select
      c.id,
      c.email_confirmed_at is not null as confirmed,
      exists (select 1 from public.listener_preferences p
              where p.user_id = c.id and p.onboarded_at is not null) as onboarded,
      exists (select 1 from public.listening_events e
              where e.user_id = c.id and e.ms_played >= 30000 and not e.soundcheck) as listened,
      (exists (select 1 from public.track_likes x where x.user_id = c.id)
        or exists (select 1 from public.track_saves x where x.user_id = c.id)
        or exists (select 1 from public.artist_follows x where x.user_id = c.id)) as engaged,
      exists (select 1 from public.listening_events e
              where e.user_id = c.id and e.ms_played >= 30000 and not e.soundcheck
                and e.started_at::date > c.created_at::date) as returned
    from cohort c
  )
  select s.step, s.accounts from (values
    (1, 'signed_up', (select count(*) from steps)::integer),
    (2, 'confirmed', (select count(*) filter (where confirmed) from steps)::integer),
    (3, 'onboarded', (select count(*) filter (where onboarded) from steps)::integer),
    (4, 'listened', (select count(*) filter (where listened) from steps)::integer),
    (5, 'engaged', (select count(*) filter (where engaged) from steps)::integer),
    (6, 'returned', (select count(*) filter (where returned) from steps)::integer)
  ) as s(ord, step, accounts)
  order by s.ord;
end;
$$;

/** Signed-in people with a real listen today, in the last 7 and the last 30 days. */
create function public.admin_active_listeners()
returns table (today integer, last_7_days integer, last_30_days integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
  select
    count(distinct e.user_id) filter (where e.started_at >= date_trunc('day', now()))::integer,
    count(distinct e.user_id) filter (where e.started_at >= now() - interval '7 days')::integer,
    count(distinct e.user_id)::integer
  from public.listening_events e
  where e.started_at >= now() - interval '30 days' and e.ms_played >= 30000 and not e.soundcheck;
end;
$$;

revoke execute on function public.admin_funnel(integer) from public, anon;
revoke execute on function public.admin_active_listeners() from public, anon;
grant execute on function public.admin_funnel(integer) to authenticated;
grant execute on function public.admin_active_listeners() to authenticated;
