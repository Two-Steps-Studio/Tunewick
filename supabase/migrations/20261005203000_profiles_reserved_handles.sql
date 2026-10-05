-- Reserved handles: names that could impersonate the platform or collide with routes.
-- Enforced in the database so no client can bypass it (docs/security.md §10, spoofing).

create function public.is_reserved_handle(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(candidate) = any (array[
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'pomoc', 'kontakt', 'contact',
    'tunewick', 'official', 'oficjalny', 'moderator', 'mod', 'staff', 'team', 'security',
    'api', 'auth', 'login', 'logowanie', 'signup', 'rejestracja', 'settings', 'ustawienia',
    'profile', 'profil', 'scene', 'scena', 'search', 'szukaj', 'library', 'biblioteka',
    'artist', 'artysta', 'artists', 'artysci', 'event', 'events', 'wydarzenia', 'premium',
    'billing', 'promo', 'legal', 'privacy', 'prywatnosc', 'terms', 'regulamin', 'null', 'undefined'
  ])
  or lower(candidate) like 'tunewick-%';
$$;

alter table public.profiles
  add constraint profiles_handle_not_reserved
  check (handle is null or not public.is_reserved_handle(handle::text));
