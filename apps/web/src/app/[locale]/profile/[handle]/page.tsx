import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPublicProfile } from "@/modules/users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/profile/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(decodeURIComponent(handle));
  if (!profile) return {};
  return { title: profile.display_name ?? `@${profile.handle}` };
}

/** Public profile: only public fields, no invented stats. */
export default async function ProfilePage({ params }: PageProps<"/[locale]/profile/[handle]">) {
  const { locale, handle } = await params;
  setRequestLocale(locale as Locale);
  const profile = await getPublicProfile(decodeURIComponent(handle));
  if (!profile) notFound();

  const t = await getTranslations("Profile");
  const format = await getFormatter();
  const since = format.dateTime(new Date(profile.created_at), { month: "long", year: "numeric" });

  return (
    <section className="profile">
      <p className="profile__handle">@{profile.handle}</p>
      <h1 className="profile__name">{profile.display_name ?? `@${profile.handle}`}</h1>
      <p className="profile__bio">{profile.bio ?? t("empty")}</p>
      <p className="profile__meta">{t("memberSince", { date: since })}</p>
    </section>
  );
}
