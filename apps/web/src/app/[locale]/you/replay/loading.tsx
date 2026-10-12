import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function ReplayLoading() {
  const t = await getTranslations("Replay");
  return <SegmentLoading rows={6} label={t("loading")} />;
}
