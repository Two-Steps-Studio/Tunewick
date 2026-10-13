"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { findArtistsForCredit } from "../actions";

type Artist = { slug: string; name: string };

/**
 * Links a credit to a Tunewick artist: type a name, pick from the list. Submits the chosen
 * profile's address as `artistSlug` (empty when none is linked).
 */
export function ArtistPicker({ error, initialSlug }: { error?: string; initialSlug?: string }) {
  const t = useTranslations("Releases.fields");
  const id = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; artists: Artist[] } | null>(null);
  const [picked, setPicked] = useState<Artist | null>(
    initialSlug ? { slug: initialSlug, name: initialSlug } : null,
  );

  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    let current = true;
    const timer = setTimeout(async () => {
      const artists = await findArtistsForCredit(query);
      if (current) setFound({ query, artists });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, picked]);

  // Results only for what is typed now (an older answer is never shown for a newer query).
  const results = !picked && found?.query === query ? found.artists : null;

  return (
    <div className="field artist-picker">
      <input type="hidden" name="artistSlug" value={picked?.slug ?? ""} />
      <label htmlFor={id} className="field__label">
        {t("creditArtist")}
      </label>
      {picked ? (
        <p className="artist-picker__picked" role="status">
          {t("creditArtistLinked", { name: picked.name })}{" "}
          <button type="button" className="button button--quiet" onClick={() => setPicked(null)}>
            {t("creditArtistClear")}
          </button>
        </p>
      ) : (
        <>
          <input
            id={id}
            type="search"
            className="field__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            aria-invalid={error ? true : undefined}
            aria-controls={`${id}-results`}
          />
          <ul id={`${id}-results`} className="artist-picker__results" aria-live="polite">
            {results?.map((artist) => (
              <li key={artist.slug}>
                <button
                  type="button"
                  className="artist-picker__option"
                  onClick={() => {
                    setPicked(artist);
                    setQuery("");
                  }}
                >
                  {artist.name} <span className="field__hint">/{artist.slug}</span>
                </button>
              </li>
            ))}
            {results && results.length === 0 ? (
              <li className="field__hint">{t("creditArtistNone")}</li>
            ) : null}
          </ul>
        </>
      )}
      <p id={`${id}-hint`} className="field__hint">
        {t("creditArtistHint")}
      </p>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
