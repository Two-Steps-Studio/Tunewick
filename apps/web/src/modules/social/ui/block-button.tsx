"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/confirm-action";
import { setBlock } from "../actions";

/** Block asks first (it ends follows both ways); unblock acts at once. */
export function BlockButton({
  profileId,
  blocked,
  name,
}: {
  profileId: string;
  blocked: boolean;
  name: string;
}) {
  const t = useTranslations("Social");
  if (blocked) {
    return (
      <form action={setBlock.bind(null, profileId, false)}>
        <button type="submit" className="button" aria-label={t("unblockNamed", { name })}>
          {t("unblock")}
        </button>
      </form>
    );
  }
  return (
    <ConfirmAction
      action={setBlock.bind(null, profileId, true)}
      label={t("block")}
      question={t("blockQuestion", { name })}
      yes={t("blockYes")}
      no={t("cancel")}
    />
  );
}
