/**
 * Names of countries and languages in any interface language, from the platform's CLDR data
 * (Intl.DisplayNames) — no lists of names to translate, so a new locale works immediately.
 */

const cache = new Map<string, Intl.DisplayNames>();

function names(locale: string, type: "region" | "language") {
  const key = `${locale}:${type}`;
  let value = cache.get(key);
  if (!value) {
    value = new Intl.DisplayNames([locale], { type, fallback: "code" });
    cache.set(key, value);
  }
  return value;
}

export function countryName(code: string, locale: string): string {
  try {
    return names(locale, "region").of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string, locale: string): string {
  try {
    const name = names(locale, "language").of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code;
  }
}

/** Flag emoji from regional indicator symbols ("PL" → 🇵🇱); decorative only. */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "1h 05m" / "14h 32m" / "42m" / "<1m" — listening time without seconds. */
export function formatListening(ms: number): string {
  if (ms > 0 && ms < 60_000) return "<1m";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

/** The public song path segment: "{title-slug}-{code}". */
export function songSegment(title: string, code: string, slugify: (s: string) => string) {
  const slug = slugify(title).slice(0, 50);
  return slug ? `${slug}-${code}` : code;
}
