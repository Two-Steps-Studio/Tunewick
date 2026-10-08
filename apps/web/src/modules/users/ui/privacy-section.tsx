import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDeletionBlockers } from "../queries";
import { DeleteAccountForm } from "./delete-account";

/** Settings section: download your data, delete your account (GDPR art. 15, 17, 20). */
export async function PrivacySection() {
  const t = await getTranslations("Privacy");
  const blockers = await getDeletionBlockers();
  return (
    <section className="settings-form__group" aria-labelledby="your-data">
      <h2 id="your-data" className="section-title">
        {t("title")}
      </h2>
      <p className="field__hint">{t("exportLead")}</p>
      <p>
        {/* A file download, not a page: a plain link keeps the browser's own download behaviour. */}
        <a className="button" href="/api/account/export" download>
          {t("export")}
        </a>
      </p>
      <p className="field__hint">{t("deleteLead")}</p>
      {blockers.length ? (
        <div className="form-status">
          <p>{t("blocked")}</p>
          <ul>
            {blockers.map((b) => (
              <li key={b.artist_id}>
                <Link href={{ pathname: "/artists/[slug]/manage", params: { slug: b.slug } }}>
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <DeleteAccountForm />
      )}
    </section>
  );
}
