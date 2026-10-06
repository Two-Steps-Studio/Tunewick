import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyArtists } from "../queries";
import { AcceptInviteButton } from "./forms";

/** Settings section: the user's artist projects and pending invitations. */
export async function MyArtists({ userId }: { userId: string }) {
  const t = await getTranslations("Artists");
  const memberships = await getMyArtists(userId);

  return (
    <section className="settings-form__group" aria-labelledby="my-artists">
      <h2 id="my-artists" className="section-title">
        {t("my.title")}
      </h2>
      {memberships.length === 0 ? <p className="field__hint">{t("my.empty")}</p> : null}
      <ul className="artist-list">
        {memberships.map(({ artist, role, accepted_at }) =>
          artist ? (
            <li key={artist.id} className="artist-list__item">
              <span className="artist-list__name">{artist.name}</span>
              {accepted_at ? (
                <Link
                  href={{ pathname: "/artists/[slug]/manage", params: { slug: artist.slug } }}
                  className="button button--quiet"
                >
                  {t("my.manage")}
                </Link>
              ) : (
                <>
                  <span className="field__hint">
                    {t("my.invitedAs", { role: t(`roles.${role}`) })}
                  </span>
                  <AcceptInviteButton artistId={artist.id} />
                </>
              )}
            </li>
          ) : null,
        )}
      </ul>
      <Link href="/artists/new" className="button button--quiet artist-list__create">
        {t("my.create")}
      </Link>
    </section>
  );
}
