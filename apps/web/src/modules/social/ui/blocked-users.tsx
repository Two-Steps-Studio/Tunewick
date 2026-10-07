import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyBlockedUsers } from "../queries";
import { BlockButton } from "./block-button";

/** Settings section: who you blocked, with unblock. Hidden while the list is empty. */
export async function BlockedUsers() {
  const t = await getTranslations("Social");
  const blocked = await getMyBlockedUsers();
  if (!blocked.length) return null;
  return (
    <section className="settings-form__group" aria-labelledby="blocked-users">
      <h2 id="blocked-users" className="section-title">
        {t("blockedTitle")}
      </h2>
      <p className="field__hint">{t("blockedLead")}</p>
      <ul className="blocked-users">
        {blocked.map((b) => {
          const name = b.display_name ?? (b.handle ? `@${b.handle}` : t("noName"));
          return (
            <li key={b.id} className="blocked-users__item">
              {b.handle ? (
                <Link href={{ pathname: "/profile/[handle]", params: { handle: b.handle } }}>
                  {name}
                </Link>
              ) : (
                <span>{name}</span>
              )}
              <BlockButton profileId={b.id} blocked name={name} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
