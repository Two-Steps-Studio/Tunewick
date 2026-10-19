import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Artwork } from "@/modules/images";
import type { Ad } from "../queries";
import { AdBeacon } from "./ad-beacon";

/**
 * A quiet sponsor card: clearly labelled, same shape as the content around it, never animated and
 * never sound. Links to a promoted release on Tunewick or opens the sponsor's site in a new tab.
 */
export async function AdCard({ ad }: { ad: Ad }) {
  const t = await getTranslations("Ads");
  const content = (
    <>
      {ad.release ? (
        <Artwork image={ad.artwork} alt="" sizes="64px" className="ad-card__art" />
      ) : null}
      <div className="ad-card__text">
        <div className="ad-card__label">
          {t("sponsored")} · {ad.advertiser}
        </div>
        <div className="ad-card__headline">{ad.headline}</div>
        {ad.body ? <div className="ad-card__body">{ad.body}</div> : null}
      </div>
      <span className="ad-card__cta">{ad.cta}</span>
    </>
  );
  return (
    <aside className="ad-card" aria-label={t("label", { advertiser: ad.advertiser })}>
      <AdBeacon id={ad.id} placement={ad.placement}>
        {ad.release ? (
          <Link
            className="ad-card__link"
            href={{
              pathname: "/artists/[slug]/releases/[release]",
              params: { slug: ad.release.artistSlug, release: ad.release.releaseSlug },
            }}
          >
            {content}
          </Link>
        ) : (
          <a
            className="ad-card__link"
            href={ad.url ?? undefined}
            target="_blank"
            rel="sponsored noopener noreferrer"
          >
            {content}
          </a>
        )}
      </AdBeacon>
    </aside>
  );
}
