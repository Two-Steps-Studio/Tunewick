"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/confirm-action";
import { clearListeningHistory } from "../actions";

export function ClearHistoryButton() {
  const t = useTranslations("Library.history");
  return (
    <ConfirmAction
      action={clearListeningHistory}
      label={t("clear")}
      question={t("clearConfirm")}
      yes={t("clearYes")}
      no={t("clearNo")}
    />
  );
}
