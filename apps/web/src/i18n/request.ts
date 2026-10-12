import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type Messages = { [key: string]: string | Messages };

/** `messages` over `fallback`: a key a translation doesn't have yet shows in English. */
function withFallback(messages: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback };
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key];
    merged[key] =
      typeof value === "object" && typeof base === "object" ? withFallback(value, base) : value;
  }
  return merged;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const own: Messages = (await import(`../../messages/${locale}.json`)).default;
  if (locale === "en") return { locale, messages: own };
  const en: Messages = (await import("../../messages/en.json")).default;
  return { locale, messages: withFallback(own, en) };
});
