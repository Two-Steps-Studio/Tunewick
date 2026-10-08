import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Footer links to the legal documents, on every page. */
export async function LegalLinks() {
  const t = await getTranslations("Legal");
  return (
    <footer className="site-footer">
      <nav aria-label={t("nav")}>
        <ul className="site-footer__links">
          <li>
            <Link href="/terms">{t("terms")}</Link>
          </li>
          <li>
            <Link href="/artist-terms">{t("artistTerms")}</Link>
          </li>
          <li>
            <Link href="/privacy">{t("privacy")}</Link>
          </li>
          <li>
            <Link href="/content-policy">{t("contentPolicy")}</Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
