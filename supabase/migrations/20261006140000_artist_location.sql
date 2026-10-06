-- Where an artist is from (M6.1, product.md D6: small independent artists from all of Poland).
-- The voivodeship is the reliable filter for discovery; the city is free text until the seeded
-- cities table arrives with events and venues (M8).

create type public.voivodeship as enum (
  'dolnoslaskie', 'kujawsko_pomorskie', 'lubelskie', 'lubuskie', 'lodzkie', 'malopolskie',
  'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'slaskie',
  'swietokrzyskie', 'warminsko_mazurskie', 'wielkopolskie', 'zachodniopomorskie'
);

alter table public.artists
  add column voivodeship public.voivodeship,
  add column city text constraint artists_city_length check (char_length(btrim(city)) between 1 and 80);

create index artists_voivodeship_idx on public.artists (voivodeship) where status = 'active';

-- Owners and managers edit these like the other descriptive columns (RLS policy unchanged).
grant update (voivodeship, city) on public.artists to authenticated;
