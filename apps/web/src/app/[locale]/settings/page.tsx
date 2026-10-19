import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUser } from "@/modules/auth";
import { MyArtists } from "@/modules/artists";
import { PlanSummary } from "@/modules/plans";
import { DecisionList } from "@/modules/reports";
import { BlockedUsers } from "@/modules/social";
import {
  Banner,
  getImageSources,
  getLatestImageUpload,
  ImageUpload,
  RemoveImageButton,
} from "@/modules/images";
import {
  Avatar,
  DiscoveryPrivacyForm,
  getMyAccount,
  PrivacySection,
  RemoveProfileImageButton,
  SettingsForm,
} from "@/modules/users";

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
  const [picture, pictureUpload, banner, bannerUpload] = await Promise.all([
    getImageSources(profile.image_id, 320),
    getLatestImageUpload("profile_image", user.id),
    getImageSources(profile.banner_image_id, 1280),
    getLatestImageUpload("banner", user.id),
  ]);
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
        {/* Artist profiles first: "where is my music?" is the question artists come here with. */}
        <MyArtists userId={user.id} />
        <section className="settings-form__group" aria-labelledby="avatar">
          <h2 id="avatar" className="section-title">
            {t("avatar.title")}
          </h2>
          <div className="cover-editor">
            <Avatar image={picture} name={profile.display_name ?? profile.handle} size="6rem" />
            <ImageUpload
              kind="profile_image"
              ownerId={user.id}
              hasImage={Boolean(picture)}
              latest={pictureUpload}
            />
          </div>
          {picture ? <RemoveProfileImageButton /> : null}
        </section>
        <section className="settings-form__group" aria-labelledby="banner">
          <h2 id="banner" className="section-title">
            {t("banner.title")}
          </h2>
          <Banner image={banner} alt="" />
          <ImageUpload
            kind="banner"
            ownerId={user.id}
            hasImage={Boolean(banner)}
            latest={bannerUpload}
          />
          {banner ? <RemoveImageButton kind="banner" ownerId={user.id} /> : null}
        </section>
        <SettingsForm
          values={{
            handle: profile.handle,
            displayName: profile.display_name,
            bio: profile.bio,
            locale: settings.locale,
            activityVisibility: settings.activity_visibility,
          }}
        />
        <DiscoveryPrivacyForm
          values={{
            profilePublic: settings.profile_public,
            stats: settings.stats_visibility,
            score: settings.score_visibility,
            badges: settings.badges_visibility,
            replay: settings.replay_visibility,
          }}
        />
        <PlanSummary />
        <BlockedUsers />
        <DecisionList filter={{ ownerId: user.id }} canAppeal />
        <PrivacySection />
      </div>
    </section>
  );
}
