import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getOptionalUser } from "@/modules/auth";
import { BlockButton, FollowButton, getRelationship, ProfileActivity } from "@/modules/social";
import { getPublicProfile } from "@/modules/users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/profile/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(decodeURIComponent(handle));
  if (!profile) return {};
  return { title: profile.display_name ?? `@${profile.handle}` };
}

/** Public profile: public fields, real follower counts, and activity as far as it is visible. */
export default async function ProfilePage({ params }: PageProps<"/[locale]/profile/[handle]">) {
  const { locale, handle } = await params;
  setRequestLocale(locale as Locale);
  const profile = await getPublicProfile(decodeURIComponent(handle));
  if (!profile) notFound();

  const [user, relationship] = await Promise.all([getOptionalUser(), getRelationship(profile.id)]);
  if (!relationship) notFound();
  const own = user?.id === profile.id;
  const name = profile.display_name ?? `@${profile.handle}`;

  const t = await getTranslations("Profile");
  const tSocial = await getTranslations("Social");
  const format = await getFormatter();
  const since = format.dateTime(new Date(profile.created_at), { month: "long", year: "numeric" });

  return (
    <section className="profile">
      <p className="profile__handle">@{profile.handle}</p>
      <h1 className="profile__name">{name}</h1>
      <p className="profile__bio">{profile.bio ?? t("empty")}</p>
      <p className="profile__meta">
        {t("memberSince", { date: since })} ·{" "}
        {tSocial("followers", { count: relationship.followers })} ·{" "}
        {tSocial("followingCount", { count: relationship.following })}
      </p>
      {user && !own ? (
        <div className="profile__follow">
          {relationship.i_blocked ? null : (
            <FollowButton profileId={profile.id} initial={relationship.i_follow} name={name} />
          )}
          <BlockButton profileId={profile.id} blocked={relationship.i_blocked} name={name} />
        </div>
      ) : null}
      <ProfileActivity profileId={profile.id} visible={relationship.activity_visible} own={own} />
    </section>
  );
}
