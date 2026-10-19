import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AdCampaignForm, AdCampaignToggle, getAdCampaigns } from "@/modules/ads";
import { requireStaff } from "@/modules/auth";

export const metadata: Metadata = { robots: { index: false } };

/** Sponsor cards (docs/ads.md): admins with MFA only (the database enforces the same rule). */
export default async function AdsAdminPage({ params }: PageProps<"/[locale]/admin/ads">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  await requireStaff("admin", {
    signIn: getPathname({
      href: { pathname: "/login", query: { next: getPathname({ href: "/admin/ads", locale }) } },
      locale,
    }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });
  const t = await getTranslations("AdsAdmin");
  const campaigns = await getAdCampaigns();

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">{t("lead")}</p>
      </div>
      <div className="auth-page__body">
        <section className="settings-form__group" aria-labelledby="ad-campaigns">
          <h2 id="ad-campaigns" className="section-title">
            {t("campaigns")}
          </h2>
          {campaigns.length === 0 ? <p className="field__hint">{t("empty")}</p> : null}
          <ul className="artist-list">
            {campaigns.map((c) => (
              <li key={c.id} className="artist-list__item">
                <div>
                  <span className="artist-list__name">
                    {c.advertiser}: {c.headline}
                  </span>
                  <span className="field__hint">
                    {" "}
                    {c.active ? t("active") : t("paused")} ·{" "}
                    {c.placements.map((p) => t(`placements.${p}`)).join(", ")} ·{" "}
                    {t("stats", { impressions: Number(c.impressions), clicks: Number(c.clicks) })}
                  </span>
                </div>
                <AdCampaignToggle campaign={c.id} active={c.active} />
                <details>
                  <summary className="field__hint">{t("edit")}</summary>
                  <AdCampaignForm campaign={c} />
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section className="settings-form__group" aria-labelledby="ad-new">
          <h2 id="ad-new" className="section-title">
            {t("new")}
          </h2>
          <AdCampaignForm />
        </section>
      </div>
    </section>
  );
}
