import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/shell/page-intro";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/scene">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Scene" });
  return { title: t("title") };
}

export default async function Page({ params }: PageProps<"/[locale]/scene">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Scene");
  const tStatus = await getTranslations("Status");

  return (
    <PageIntro
      title={t("title")}
      lead={t("lead")}
      empty={t("empty")}
      status={tStatus("inDevelopment")}
    />
  );
}
