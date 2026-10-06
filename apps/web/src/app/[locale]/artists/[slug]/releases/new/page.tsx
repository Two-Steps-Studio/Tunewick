import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getArtistBySlug, isArtistMember } from "@/modules/artists";
import { AuthPage, requireUser } from "@/modules/auth";
import { NewReleaseForm } from "@/modules/catalog";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewReleasePage({
  params,
}: PageProps<"/[locale]/artists/[slug]/releases/new">) {
  const { locale: rawLocale, slug: rawSlug } = await params;
  const locale = rawLocale as Locale;
  const slug = decodeURIComponent(rawSlug);
  setRequestLocale(locale);

  const here = getPathname({
    href: { pathname: "/artists/[slug]/releases/new", params: { slug } },
    locale,
  });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const artist = await getArtistBySlug(slug);
  if (!artist || !(await isArtistMember(artist.id))) notFound();

  const t = await getTranslations("Releases.create");
  return (
    <AuthPage title={t("title")} lead={t("lead")}>
      <NewReleaseForm artist={{ id: artist.id, slug: artist.slug }} />
    </AuthPage>
  );
}
