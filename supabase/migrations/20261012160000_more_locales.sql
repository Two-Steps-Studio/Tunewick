-- Interface languages for a worldwide launch: German, Spanish, French and Portuguese join Polish
-- and English. A new account keeps the language it signed up in; an unknown one gets English
-- (the language for visitors whose own isn't offered).

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_locale text := meta ->> 'locale';
  requested_name text := nullif(btrim(meta ->> 'display_name'), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 80));

  insert into public.profile_settings (user_id, locale, age_confirmed_at)
  values (
    new.id,
    case when requested_locale in ('pl', 'en', 'de', 'es', 'fr', 'pt') then requested_locale else 'en' end,
    case when (meta ->> 'age_confirmed') = 'true' then now() else null end
  );

  return new;
end;
$$;
