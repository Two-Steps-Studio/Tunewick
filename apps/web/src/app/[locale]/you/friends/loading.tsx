import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function FriendsLoading() {
  const t = await getTranslations("Friends");
  return <SegmentLoading rows={6} label={t("loading")} />;
}
