/** The 16 Polish voivodeships (DB enum public.voivodeship), in alphabetical order by Polish name. */
export const VOIVODESHIPS = [
  "dolnoslaskie",
  "kujawsko_pomorskie",
  "lubelskie",
  "lubuskie",
  "lodzkie",
  "malopolskie",
  "mazowieckie",
  "opolskie",
  "podkarpackie",
  "podlaskie",
  "pomorskie",
  "slaskie",
  "swietokrzyskie",
  "warminsko_mazurskie",
  "wielkopolskie",
  "zachodniopomorskie",
] as const;

export type Voivodeship = (typeof VOIVODESHIPS)[number];

export function isVoivodeship(value: string): value is Voivodeship {
  return (VOIVODESHIPS as readonly string[]).includes(value);
}
