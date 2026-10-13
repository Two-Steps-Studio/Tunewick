import { getTranslations } from "next-intl/server";
import { removeProfileImage } from "../actions";

export async function RemoveProfileImageButton() {
  const t = await getTranslations("Settings.avatar");
  return (
    <form action={removeProfileImage}>
      <button type="submit" className="button button--quiet button--danger">
        {t("remove")}
      </button>
    </form>
  );
}
