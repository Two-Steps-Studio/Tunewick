import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUser } from "@/modules/auth";
import { getReportSubject, ReportForm } from "@/modules/reports";

export const metadata: Metadata = { robots: { index: false } };

/** Notice form (DSA notice-and-action): /zglos?typ=release&id=… */
export default async function ReportPage({ params, searchParams }: PageProps<"/[locale]/report">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const type = typeof query.typ === "string" ? query.typ : "";
  const id = typeof query.id === "string" ? query.id : "";
  const here = getPathname({ href: { pathname: "/report", query: { typ: type, id } }, locale });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const subject = await getReportSubject(type, id);
  if (!subject) notFound();
  const t = await getTranslations("Reports");

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">
          {t("about", { subject: t(`subjects.${subject.type}`), title: subject.title })}
        </p>
        <p className="field__hint">{t("lead")}</p>
      </div>
      <div className="auth-page__body">
        <ReportForm subjectType={subject.type} subjectId={subject.id} />
      </div>
    </section>
  );
}
