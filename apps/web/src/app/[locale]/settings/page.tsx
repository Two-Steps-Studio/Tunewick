import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUser } from "@/modules/auth";
import { MyArtists } from "@/modules/artists";
import { PlanSummary } from "@/modules/plans";
import { DecisionList } from "@/modules/reports";
import { BlockedUsers } from "@/modules/social";
import { getMyAccount, PrivacySection, SettingsForm } from "@/modules/users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/settings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Settings" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const signIn = getPathname({
    href: { pathname: "/login", query: { next: getPathname({ href: "/settings", locale }) } },
    locale,
  });
  const user = await requireUser(signIn);
  const { profile, settings } = await getMyAccount(user.id);
  const t = await getTranslations("Settings");
  const tSecurity = await getTranslations("Security");

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">{t("lead")}</p>
        <p className="settings-profile-link">
          {profile.handle ? (
            <Link href={{ pathname: "/profile/[handle]", params: { handle: profile.handle } }}>
              {t("viewProfile")}
            </Link>
          ) : (
            t("noHandle")
          )}
        </p>
        <p className="settings-profile-link">
          <Link href="/settings/security">{tSecurity("link")}</Link>
        </p>
      </div>
      <div className="auth-page__body">
        <SettingsForm
          values={{
            handle: profile.handle,
            displayName: profile.display_name,
            bio: profile.bio,
            locale: settings.locale,
            activityVisibility: settings.activity_visibility,
          }}
        />
        <PlanSummary />
        <MyArtists userId={user.id} />
        <BlockedUsers />
        <DecisionList filter={{ ownerId: user.id }} canAppeal />
        <PrivacySection />
      </div>
    </section>
  );
}
