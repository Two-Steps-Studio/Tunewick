import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Artwork, getImageSources, getLatestImageUpload, ImageUpload } from "@/modules/images";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DecisionList } from "@/modules/reports";
import { cancelEvent, EventForm, getManagedEvents } from "@/modules/events";
import {
  ArtistInfoForm,
  ArtistReachForm,
  ArtistListening,
  getArtistForManagement,
  getArtistReach,
  InviteMemberForm,
  RemoveMemberButton,
  VerificationForm,
} from "@/modules/artists";
import { requireUser } from "@/modules/auth";
import { ArtistReleaseList } from "@/modules/catalog";
import { countryName } from "@/lib/intl";
import { getCountryCodes, getGenres } from "@/modules/discover";

export const metadata: Metadata = { robots: { index: false } };

export default async function ManageArtistPage({
  params,
}: PageProps<"/[locale]/artists/[slug]/manage">) {
  const { locale: rawLocale, slug: rawSlug } = await params;
  const locale = rawLocale as Locale;
  const slug = decodeURIComponent(rawSlug);
  setRequestLocale(locale);

  const here = getPathname({
    href: { pathname: "/artists/[slug]/manage", params: { slug } },
    locale,
  });
  const user = await requireUser(
    getPathname({ href: { pathname: "/login", query: { next: here } }, locale }),
  );
  // Non-members get the same 404 as a missing artist (no information leak).
  const data = await getArtistForManagement(slug, user.id);
  const tEvents = await getTranslations("Events");
  if (!data) notFound();

  const t = await getTranslations("Artists");
  const { artist, myRole, members } = data;
  const isOwner = myRole === "owner";
  const [photo, photoUpload, reach, genres, countries] = await Promise.all([
    getImageSources(artist.image_id),
    myRole !== "member" ? getLatestImageUpload("artist_image", artist.id) : null,
    getArtistReach(artist.id),
    getGenres(locale),
    getCountryCodes(),
  ]);
  const canRequest =
    myRole !== "member" &&
    (artist.verification_status === "unverified" || artist.verification_status === "rejected");

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <p className={`artist-badge artist-badge--${artist.verification_status}`}>
          {t(`verification.${artist.verification_status}`)}
        </p>
        <h1 className="auth-page__title">{t("manage.title", { name: artist.name })}</h1>
        <p className="settings-profile-link">
          <Link href={{ pathname: "/artists/[slug]", params: { slug: artist.slug } }}>
            {t("manage.viewPublic")}
          </Link>
        </p>
      </div>

      <div className="auth-page__body">
        {myRole !== "member" ? (
          <section className="settings-form__group" aria-labelledby="info">
            <h2 id="info" className="section-title">
              {t("manage.info")}
            </h2>
            <ArtistInfoForm
              artistId={artist.id}
              values={{
                name: artist.name,
                bio: artist.bio,
                formedYear: artist.formed_year,
                voivodeship: artist.voivodeship,
                city: artist.city,
              }}
            />
          </section>
        ) : null}

        {myRole !== "member" ? (
          <section className="settings-form__group" aria-labelledby="reach">
            <h2 id="reach" className="section-title">
              {t("manage.reach")}
            </h2>
            <ArtistReachForm
              artistId={artist.id}
              values={{
                country: artist.country_code,
                region: artist.region,
                languages: artist.languages,
                genres: reach.genres.map((g) => g.id),
                links: reach.links.map((l) => l.url),
              }}
              countries={countries
                .map((c) => ({ code: c.code, name: countryName(c.code, locale) }))
                .sort((a, b) => a.name.localeCompare(b.name, locale))}
              genres={genres}
            />
          </section>
        ) : null}

        {myRole !== "member" ? (
          <section className="settings-form__group" aria-labelledby="photo">
            <h2 id="photo" className="section-title">
              {t("manage.photo")}
            </h2>
            <div className="cover-editor">
              <Artwork image={photo} alt={artist.name} sizes="10rem" className="artwork--round" />
              <ImageUpload
                kind="artist_image"
                ownerId={artist.id}
                hasImage={Boolean(photo)}
                latest={photoUpload}
              />
            </div>
          </section>
        ) : null}

        <ArtistReleaseList artist={{ id: artist.id, slug: artist.slug }} />

        <section className="settings-form__group" aria-labelledby="members">
          <h2 id="members" className="section-title">
            {t("manage.members")}
          </h2>
          <ul className="artist-list">
            {members.map((m) => (
              <li key={m.user_id} className="artist-list__item">
                <span className="artist-list__name">
                  {m.user_id === user.id
                    ? t("manage.you")
                    : (m.profile?.display_name ??
                      (m.profile?.handle ? `@${m.profile.handle}` : t("manage.noName")))}
                </span>
                <span className="field__hint">
                  {t(`roles.${m.role}`)}
                  {m.accepted_at ? "" : ` · ${t("manage.invited")}`}
                </span>
                {m.user_id === user.id ? (
                  <RemoveMemberButton
                    artistId={artist.id}
                    memberId={m.user_id}
                    label={t("manage.leave")}
                  />
                ) : isOwner ? (
                  <RemoveMemberButton
                    artistId={artist.id}
                    memberId={m.user_id}
                    label={t("manage.remove")}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? <InviteMemberForm artistId={artist.id} /> : null}
        </section>

        <section className="settings-form__group" aria-labelledby="verification">
          <h2 id="verification" className="section-title">
            {t("manage.verification")}
          </h2>
          <p className="field__hint">{t("manage.verificationLead")}</p>
          {data.lastRequest?.status === "rejected" && data.lastRequest.decision_note ? (
            <p className="form-status">
              {t("manage.verificationRejected", { reason: data.lastRequest.decision_note })}
            </p>
          ) : null}
          {canRequest ? (
            <VerificationForm artistId={artist.id} />
          ) : (
            <p role="status">{t(`verification.${artist.verification_status}`)}</p>
          )}
        </section>
        {data.myRole === "owner" || data.myRole === "manager" ? (
          <section className="settings-form__group" aria-labelledby="gigs">
            <h2 id="gigs" className="section-title">
              {tEvents("manage.title")}
            </h2>
            <p className="field__hint">{tEvents("manage.lead")}</p>
            <ul className="promo-codes">
              {(await getManagedEvents(artist.id)).map((e) => (
                <li key={e.id} className="promo-codes__item">
                  <Link
                    className="artist-list__name"
                    href={{ pathname: "/events/[id]", params: { id: e.id } }}
                  >
                    {e.title}
                  </Link>
                  <span className="field__hint">
                    {e.venue ? `${e.venue.name}, ${e.venue.city} · ` : ""}
                    {tEvents(`status.${e.status}`)}
                  </span>
                  {e.status === "rejected" && e.review_note ? (
                    <p className="form-status">{tEvents("rejected", { reason: e.review_note })}</p>
                  ) : null}
                  {e.status === "pending" || e.status === "published" ? (
                    <form action={cancelEvent.bind(null, e.id)}>
                      <button type="submit" className="button button--quiet">
                        {tEvents("manage.cancel", { title: e.title })}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            <EventForm artistId={artist.id} />
          </section>
        ) : null}
        <ArtistListening artistId={artist.id} />
        <DecisionList
          filter={{ artistId: artist.id }}
          canAppeal={data.myRole === "owner" || data.myRole === "manager"}
        />
      </div>
    </section>
  );
}
