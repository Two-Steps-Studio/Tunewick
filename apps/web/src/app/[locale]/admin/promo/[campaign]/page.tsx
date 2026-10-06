import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireStaff } from "@/modules/auth";
import {
  GenerateForm,
  getCampaign,
  RevokeForm,
  SharedCodeForm,
  setCampaignActive,
  setCodeActive,
} from "@/modules/promo-admin";

export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PromoCampaignPage({
  params,
}: PageProps<"/[locale]/admin/promo/[campaign]">) {
  const { locale: rawLocale, campaign: id } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  await requireStaff("admin", {
    signIn: getPathname({
      href: { pathname: "/login", query: { next: getPathname({ href: "/admin/promo", locale }) } },
      locale,
    }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });
  if (!UUID.test(id)) notFound();
  const data = await getCampaign(id);
  if (!data) notFound();
  const { campaign, codes, redemptions } = data;
  const t = await getTranslations("PromoAdmin");
  const format = await getFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeZone: "Europe/Warsaw" });
  const benefit = (type: string, value: number | null) =>
    t(`benefit.${type as "premium_days"}`, { value: value ?? 0 });

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <p className="settings-profile-link">
          <Link href="/admin/promo">{t("back")}</Link>
        </p>
        <h1 className="auth-page__title">{campaign.name}</h1>
        <p className="auth-page__lead">
          {[
            campaign.partner,
            campaign.description,
            t("redemptions", {
              count: campaign.redemptions_count,
              max: campaign.max_redemptions_total ?? "∞",
            }),
            campaign.ends_at ? t("endsOn", { date: date(campaign.ends_at) }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <form action={setCampaignActive.bind(null, campaign.id, !campaign.active)}>
          <p className={campaign.active ? "plan-status__premium" : "plan-status__free"}>
            {campaign.active ? t("campaignActive") : t("campaignInactive")}
          </p>
          <button type="submit" className="button">
            {campaign.active ? t("deactivate") : t("activate")}
          </button>
        </form>
      </div>

      <div className="auth-page__body">
        <section className="settings-form__group" aria-labelledby="generate">
          <h2 id="generate" className="section-title">
            {t("generateTitle")}
          </h2>
          <p className="field__hint">{t("generateHint")}</p>
          <GenerateForm campaign={campaign.id} campaignName={campaign.name} />
        </section>

        <section className="settings-form__group" aria-labelledby="shared">
          <h2 id="shared" className="section-title">
            {t("sharedTitle")}
          </h2>
          <p className="field__hint">{t("sharedHint")}</p>
          <SharedCodeForm campaign={campaign.id} />
        </section>

        <section className="settings-form__group" aria-labelledby="codes">
          <h2 id="codes" className="section-title">
            {t("codesTitle", { count: codes.length })}
          </h2>
          {codes.length === 0 ? <p className="field__hint">{t("noCodes")}</p> : null}
          <ul className="promo-codes">
            {codes.map((c) => (
              <li key={c.id} className="promo-codes__item">
                <span className="promo-codes__hint">
                  {c.shared ? t("sharedLabel") : "…"}
                  {c.code_hint}
                </span>
                <span className="field__hint">
                  {[
                    benefit(c.benefit_type, c.benefit_value),
                    t("uses", { count: c.uses_count, max: c.max_uses ?? "∞" }),
                    c.expires_at ? t("expires", { date: date(c.expires_at) }) : null,
                    c.eligibility && "new_accounts_days" in (c.eligibility as object)
                      ? t("newAccountsOnly")
                      : null,
                    c.active ? null : t("inactive"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <form action={setCodeActive.bind(null, c.id, !c.active)}>
                  <button
                    type="submit"
                    className="button button--quiet"
                    aria-label={`${c.active ? t("deactivate") : t("activate")}: ${c.code_hint}`}
                  >
                    {c.active ? t("deactivate") : t("activate")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-form__group" aria-labelledby="redemptions">
          <h2 id="redemptions" className="section-title">
            {t("redemptionsTitle", { count: redemptions.length })}
          </h2>
          {redemptions.length === 0 ? <p className="field__hint">{t("noRedemptions")}</p> : null}
          <ul className="promo-codes">
            {redemptions.map((r) => (
              <li key={r.id} className="promo-codes__item">
                <span>
                  {r.handle ? `@${r.handle}` : (r.display_name ?? r.user_id.slice(0, 8))}{" "}
                  <span className="promo-codes__hint">…{r.code_hint}</span>
                </span>
                <span className="field__hint">
                  {[
                    format.dateTime(new Date(r.redeemed_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Warsaw",
                    }),
                    r.status === "revoked"
                      ? t("revoked")
                      : r.ends_at
                        ? t("premiumUntil", { date: date(r.ends_at) })
                        : t("premiumLifetime"),
                  ].join(" · ")}
                </span>
                {r.status === "granted" ? <RevokeForm redemption={r.id} /> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
