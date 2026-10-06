-- Rights declaration rules (M2.4, docs/licensing.md §3).

-- Cleared samples must be described; collective-management membership must be answered
-- explicitly ("none" or "unknown" are answers, an empty list is not).
alter table public.rights_declarations
  add constraint rights_samples_described
    check (samples = 'none' or char_length(btrim(coalesce(samples_description, ''))) > 0),
  add constraint rights_cmo_answered
    check (cardinality(cmo_memberships) >= 1),
  add constraint rights_cmo_none_exclusive
    check (not ('none' = any (cmo_memberships)) or cardinality(cmo_memberships) = 1);

-- The latest declaration is the source of truth for AI involvement: keep the release in sync
-- in the same transaction (one fact, one value).
create function private.sync_release_ai_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.releases r set ai_content = new.ai_content
  where r.id = new.release_id and r.ai_content is distinct from new.ai_content;
  return null;
end;
$$;

create trigger rights_declarations_sync_ai
  after insert on public.rights_declarations
  for each row execute function private.sync_release_ai_content();
