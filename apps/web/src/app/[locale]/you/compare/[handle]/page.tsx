import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatListening } from "@/lib/intl";
import { requireUser } from "@/modules/auth";
import { compareWith, type DiscoverySummary } from "@/modules/social";
import { getPublicProfile } from "@/modules/users";

export const metadata: Metadata = { robots: { index: false } };

const PERIODS = { week: 7, month: 30, all: 0 } as const;
type Period = keyof typeof PERIODS;

/**
 * You vs a friend. Only when the friend allows it (their activity visibility); otherwise the page
 * says so and shows nothing of theirs.
 */
export default async function ComparePage({
  params,
  searchParams,
}: PageProps<"/[locale]/you/compare/[handle]">) {
  const { locale: rawLocale, handle: rawHandle } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const handle = decodeURIComponent(rawHandle);
  await requireUser(
    getPathname({
      href: {
        pathname: "/login",
        query: {
          next: getPathname({
            href: { pathname: "/you/compare/[handle]", params: { handle } },
            locale,
          }),
        },
      },
      locale,
    }),
  );
  const profile = await getPublicProfile(handle);
  if (!profile?.handle) notFound();
  const query = await searchParams;
  const period: Period = query.period === "month" || query.period === "all" ? query.period : "week";
  const t = await getTranslations("Compare");
  const format = await getFormatter();
  const result = await compareWith(profile.handle, PERIODS[period]);
  const name = profile.display_name ?? `@${profile.handle}`;

  const rows: [string, (s: DiscoverySummary) => string][] = [
    ["songs", (s) => format.number(s.songs)],
    ["artists", (s) => format.number(s.artists)],
    ["newArtists", (s) => format.number(s.new_artists)],
    ["countries", (s) => format.number(s.countries)],
    ["listening", (s) => formatListening(Number(s.listening_ms))],
    ["points", (s) => format.number(s.points)],
  ];

  return (
    <section className="you">
      <h1 className="you__title">{t("title", { name })}</h1>
      {result === null ? (
        <>
          <p className="you__lead">{t("private", { name })}</p>
          <Link
            href={{ pathname: "/profile/[handle]", params: { handle: profile.handle } }}
            className="button"
          >
            {t("back", { name })}
          </Link>
        </>
      ) : (
        <>
          <nav className="region-filter" aria-label={t("period")}>
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <Link
                key={p}
                href={{
                  pathname: "/you/compare/[handle]",
                  params: { handle: profile.handle! },
                  query: { period: p },
                }}
                className="region-filter__chip"
                aria-current={p === period ? "page" : undefined}
              >
                {t(`periods.${p}`)}
              </Link>
            ))}
          </nav>
          <table className="compare">
            <thead>
              <tr>
                <td />
                <th scope="col">{t("you")}</th>
                <th scope="col">{name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, value]) => {
                const mine = value(result.me);
                const theirs = value(result.them);
                return (
                  <tr key={key}>
                    <th scope="row">{t(`rows.${key as "songs"}`)}</th>
                    <td>{mine}</td>
                    <td>{theirs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="field__hint">{t("hint")}</p>
        </>
      )}
    </section>
  );
}
