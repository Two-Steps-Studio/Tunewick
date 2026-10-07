"use client";

import { DISCOVERY_MODES, type DiscoveryMode } from "@tunewick/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { flagEmoji, languageName } from "@/lib/intl";
import { saveDiscoveryPreferences, suggestArtists, type SuggestedArtist } from "../actions";
import type { DiscoveryPreferences } from "../types";

/** Country from the browser's language tag ("pl-PL" → PL), as a suggestion only. */
function browserCountry(codes: Set<string>): string | null {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const region = tag.split("-")[1]?.toUpperCase();
    if (region && codes.has(region)) return region;
  }
  return null;
}

/**
 * First run (and later "Discovery preferences"): language, country, a few genres, a few artists,
 * where to start. One screen, every part optional — a useful feed in under a minute.
 */
export function Onboarding({
  genres,
  countries,
  initial,
  signedIn,
}: {
  genres: { id: number; name: string }[];
  /** Sorted, with names in the interface language (computed on the server: one ICU, no mismatch). */
  countries: { code: string; name: string }[];
  initial: DiscoveryPreferences;
  signedIn: boolean;
}) {
  const t = useTranslations("Onboarding");
  const tModes = useTranslations("Feed.modes");
  const locale = useLocale();
  const router = useRouter();
  const [language, setLanguage] = useState(initial.languages[0] ?? locale);
  const [country, setCountry] = useState<string | null>(initial.countryCode);
  const [picked, setPicked] = useState<number[]>(initial.genreIds);
  const [mode, setMode] = useState<DiscoveryMode>(initial.mode);
  const [follow, setFollow] = useState<string[]>([]);
  const [artists, setArtists] = useState<SuggestedArtist[]>([]);
  const [rankings, setRankings] = useState(initial.showInRankings);
  const [hideExplicit, setHideExplicit] = useState(initial.hideExplicit);
  const [exploration, setExploration] = useState(Math.round(initial.explorationShare * 100));
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initial.countryCode || initial.onboarded) return;
    const guess = browserCountry(new Set(countries.map((c) => c.code)));
    // A suggestion from the browser, shown in the form — the listener decides.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guess) setCountry(guess);
  }, [countries, initial.countryCode, initial.onboarded]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void suggestArtists(picked, country).then((list) => {
      if (!cancelled) setArtists(list);
    });
    return () => {
      cancelled = true;
    };
  }, [picked, country, signedIn]);

  const toggleGenre = (id: number) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((g) => g !== id)
        : current.length < 12
          ? [...current, id]
          : current,
    );

  const submit = (skip: boolean) =>
    startTransition(async () => {
      setFailed(false);
      const result = await saveDiscoveryPreferences({
        countryCode: skip ? initial.countryCode : country,
        genreIds: skip ? initial.genreIds : picked,
        languages: [language],
        mode: skip ? initial.mode : mode,
        artistIds: skip ? [] : follow,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hideExplicit,
        showInRankings: rankings,
        explorationShare: exploration / 100,
      });
      if (!result.ok) {
        setFailed(true);
        return;
      }
      const nextLocale = (routing.locales as readonly string[]).includes(language)
        ? (language as (typeof routing.locales)[number])
        : undefined;
      router.replace("/", nextLocale ? { locale: nextLocale } : undefined);
    });

  return (
    <form
      className="onboarding"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <fieldset className="onboarding__step">
        <legend className="onboarding__legend">{t("language")}</legend>
        <div className="chip-row">
          {routing.locales.map((code) => (
            <label key={code} className="chip">
              <input
                type="radio"
                name="language"
                value={code}
                checked={language === code}
                onChange={() => setLanguage(code)}
              />
              <span lang={code}>{languageName(code, code)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="onboarding__step">
        <legend className="onboarding__legend">{t("country")}</legend>
        <p className="field__hint">{t("countryHint")}</p>
        <select
          className="field__input onboarding__select"
          value={country ?? ""}
          onChange={(event) => setCountry(event.target.value || null)}
          aria-label={t("country")}
        >
          <option value="">{t("noCountry")}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {`${flagEmoji(c.code)} ${c.name}`}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="onboarding__step">
        <legend className="onboarding__legend">{t("genres")}</legend>
        <p className="field__hint">{t("genresHint")}</p>
        <div className="chip-row">
          {genres.map((g) => (
            <label key={g.id} className="chip">
              <input
                type="checkbox"
                checked={picked.includes(g.id)}
                onChange={() => toggleGenre(g.id)}
              />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {signedIn ? (
        <fieldset className="onboarding__step">
          <legend className="onboarding__legend">{t("artists")}</legend>
          <p className="field__hint">{artists.length ? t("artistsHint") : t("artistsEmpty")}</p>
          <div className="chip-row">
            {artists.map((a) => (
              <label key={a.id} className="chip chip--artist">
                <input
                  type="checkbox"
                  checked={follow.includes(a.id)}
                  onChange={() =>
                    setFollow((current) =>
                      current.includes(a.id)
                        ? current.filter((id) => id !== a.id)
                        : [...current, a.id],
                    )
                  }
                />
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants
                  <img
                    src={a.image.src}
                    alt=""
                    width={32}
                    height={32}
                    className="chip__photo"
                    loading="lazy"
                  />
                ) : null}
                <span>{a.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="field__hint">{t("artistsSignIn")}</p>
      )}

      <fieldset className="onboarding__step">
        <legend className="onboarding__legend">{t("mode")}</legend>
        <div className="chip-row">
          {DISCOVERY_MODES.map((m) => (
            <label key={m} className="chip">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span>{tModes(m)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="onboarding__more">
        <summary>{t("more")}</summary>
        <label className="field">
          <span className="field__label">{t("exploration", { value: exploration })}</span>
          <input
            type="range"
            min={10}
            max={40}
            step={5}
            value={exploration}
            onChange={(event) => setExploration(Number(event.target.value))}
          />
          <span className="field__hint">{t("explorationHint")}</span>
        </label>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            className="field__checkbox"
            checked={hideExplicit}
            onChange={(e) => setHideExplicit(e.target.checked)}
          />
          <span>{t("hideExplicit")}</span>
        </label>
        {signedIn ? (
          <label className="field field--checkbox">
            <input
              type="checkbox"
              className="field__checkbox"
              checked={rankings}
              onChange={(e) => setRankings(e.target.checked)}
            />
            <span>{t("rankings")}</span>
          </label>
        ) : null}
      </details>

      {failed ? (
        <p role="alert" className="field__error">
          {t("failed")}
        </p>
      ) : null}
      <div className="onboarding__buttons">
        <button
          type="submit"
          className="button button--primary"
          disabled={pending}
          aria-busy={pending}
        >
          {t("submit")}
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={pending}
          onClick={() => submit(true)}
        >
          {t("skip")}
        </button>
      </div>
    </form>
  );
}
