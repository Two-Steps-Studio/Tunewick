import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CreateArtistForm } from "@/modules/artists";
import { AuthPage, requireUser } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/artists/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Artists.create" });
  return { title: t("title"), robots: { index: false } };
}

export default async function NewArtistPage({ params }: PageProps<"/[locale]/artists/new">) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const here = getPathname({ href: "/artists/new", locale });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const t = await getTranslations("Artists.create");

  return (
    <AuthPage title={t("title")} lead={t("lead")}>
      <CreateArtistForm />
    </AuthPage>
  );
}
