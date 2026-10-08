import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function TodayLoading() {
  const t = await getTranslations("Today");
  return <SegmentLoading rows={6} label={t("loading")} />;
}
