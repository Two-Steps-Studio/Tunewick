import { getTranslations } from "next-intl/server";

/**
 * Persistent player slot. It lives in the locale layout so it survives navigation.
 * Until playback exists it shows an honest idle state — no fake track, no dead controls.
 */
export async function PlayerBar() {
  const t = await getTranslations("Player");
  return (
    <section aria-label={t("region")} className="player-bar">
      <span className="player-bar__spark" aria-hidden="true" />
      <p className="player-bar__text">
        <span>{t("idle")}</span> <span className="player-bar__hint">{t("idleHint")}</span>
      </p>
    </section>
  );
}
