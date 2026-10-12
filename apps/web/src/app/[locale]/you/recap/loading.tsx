import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function RecapLoading() {
  const t = await getTranslations("Recap");
  return <SegmentLoading rows={6} label={t("loading")} />;
}
