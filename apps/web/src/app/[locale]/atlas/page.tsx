import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getAtlasCountries, WorldMap } from "@/modules/atlas";
import { getOptionalUser } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/atlas">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Atlas" });
  return { title: t("title"), description: t("lead") };
}

const REGIONS = ["europe", "americas", "asia", "africa", "oceania"] as const;

/** The music map: where music on Tunewick comes from, and (signed in) where you have travelled. */
export default async function AtlasPage({ params }: PageProps<"/[locale]/atlas">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, tRegions, format, countries, user] = await Promise.all([
    getTranslations("Atlas"),
    getTranslations("Atlas.regions"),
    getFormatter(),
    getAtlasCountries(),
    getOptionalUser(),
  ]);
  const name = (code: string) => countryName(code, locale);
  const href = (code: string) =>
    getPathname({
      href: { pathname: "/atlas/[country]", params: { country: code.toLowerCase() } },
      locale: locale as Locale,
    });
  const mine = countries.filter((c) => c.discovered).length;

  return (
    <section className="stats atlas">
      <header className="stats__head">
        <h1 className="stats__title">{t("title")}</h1>
        <p className="stats__lead">{t("lead")}</p>
        {user ? (
          <p className="atlas__mine">{t("mine", { count: mine, total: countries.length })}</p>
        ) : null}
      </header>

      {countries.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <>
          <WorldMap
            title={t("mapTitle")}
            countries={countries.map((c) => ({
              code: c.country_code,
              artists: c.artists,
              mine: c.discovered,
              href: href(c.country_code),
              label: t("countryLabel", { country: name(c.country_code), count: c.artists }),
            }))}
            legend={{
              none: t("legend.none"),
              steps: [t("legend.one"), t("legend.few"), t("legend.many"), t("legend.most")],
              mine: user ? t("legend.mine") : null,
            }}
          />
          <div className="atlas__regions">
            {REGIONS.map((region) => {
              const list = countries.filter((c) => c.region === region);
              if (!list.length) return null;
              return (
                <section
                  key={region}
                  aria-labelledby={`region-${region}`}
                  className="stats__section"
                >
                  <h2 id={`region-${region}`} className="section-title">
                    {tRegions(region)}
                  </h2>
                  <ul className="atlas-list">
                    {list.map((c) => (
                      <li key={c.country_code} className={c.discovered ? "is-mine" : undefined}>
                        <Link
                          href={{
                            pathname: "/atlas/[country]",
                            params: { country: c.country_code.toLowerCase() },
                          }}
                        >
                          {flagEmoji(c.country_code)} {name(c.country_code)}
                        </Link>
                        <span>
                          {t("artists", { count: c.artists })}
                          {c.listeners_7d
                            ? ` · ${t("listening", { count: format.number(c.listeners_7d) })}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
