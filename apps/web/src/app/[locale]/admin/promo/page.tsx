import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireStaff } from "@/modules/auth";
import { CampaignForm, getCampaigns } from "@/modules/promo-admin";

export const metadata: Metadata = { robots: { index: false } };

/** Promotions: admins with MFA only (the database enforces the same rule). */
export default async function PromoAdminPage({ params }: PageProps<"/[locale]/admin/promo">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  await requireStaff("admin", {
    signIn: getPathname({
      href: { pathname: "/login", query: { next: getPathname({ href: "/admin/promo", locale }) } },
      locale,
    }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });
  const t = await getTranslations("PromoAdmin");
  const format = await getFormatter();
  const campaigns = await getCampaigns();

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">{t("lead")}</p>
      </div>
      <div className="auth-page__body">
        <section className="settings-form__group" aria-labelledby="campaigns">
          <h2 id="campaigns" className="section-title">
            {t("campaigns")}
          </h2>
          {campaigns.length === 0 ? <p className="field__hint">{t("noCampaigns")}</p> : null}
          <ul className="artist-list">
            {campaigns.map((c) => (
              <li key={c.id} className="artist-list__item">
                <Link
                  className="artist-list__name"
                  href={{ pathname: "/admin/promo/[campaign]", params: { campaign: c.id } }}
                >
                  {c.name}
                </Link>
                <span className="field__hint">
                  {[
                    c.active ? t("active") : t("inactive"),
                    c.partner,
                    t("redemptions", {
                      count: c.redemptions_count,
                      max: c.max_redemptions_total ?? "∞",
                    }),
                    c.ends_at
                      ? t("endsOn", {
                          date: format.dateTime(new Date(c.ends_at), {
                            dateStyle: "medium",
                            timeZone: "Europe/Warsaw",
                          }),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="settings-form__group" aria-labelledby="new-campaign">
          <h2 id="new-campaign" className="section-title">
            {t("newCampaign")}
          </h2>
          <CampaignForm />
        </section>
      </div>
    </section>
  );
}
