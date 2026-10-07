"use client";

import { useLocale, useTranslations } from "next-intl";
import { countryName, flagEmoji } from "@/lib/intl";
import { dismissNotice, useCurrentNotice, type Notice } from "../store";

function useText(notice: Notice) {
  const t = useTranslations("Notices");
  const tAchievements = useTranslations("You.achievements.names");
  const locale = useLocale();
  switch (notice.kind) {
    case "award": {
      const parts = notice.parts
        .filter((part) => part !== "new_country" || !notice.country)
        .map((part) => t(`parts.${part as "new_song"}`));
      if (notice.country) {
        parts.push(
          `${flagEmoji(notice.country)} ${t("parts.country", { country: countryName(notice.country, locale) })}`,
        );
      }
      return { lead: t("points", { points: notice.points }), text: parts.join(" · ") };
    }
    case "goal":
      return { lead: "🎉", text: t(`goal.${notice.goal}`, { target: notice.target }) };
    case "streak":
      return { lead: "🔥", text: t("streak", { days: notice.days }) };
    case "roll":
      return { lead: "✨", text: t("roll", { count: notice.count }) };
    case "achievement":
      return {
        lead: "🏆",
        text: t("achievement", { name: tAchievements(notice.code as "first_discovery") }),
      };
  }
}

function NoticeView({ notice }: { notice: Notice }) {
  const t = useTranslations("Notices");
  const { lead, text } = useText(notice);
  return (
    <div className={`progress-notice progress-notice--${notice.kind}`} key={notice.id}>
      <span className="progress-notice__lead">{lead}</span>
      <span className="progress-notice__text">{text}</span>
      <button
        type="button"
        className="progress-notice__close"
        onClick={dismissNotice}
        aria-label={t("dismiss")}
      >
        ×
      </button>
    </div>
  );
}

/** Where progress shows up — one quiet line above the player, announced politely. */
export function ProgressNotices() {
  const notice = useCurrentNotice();
  return (
    <div className="progress-notices" aria-live="polite" aria-atomic="true">
      {notice ? <NoticeView key={notice.id} notice={notice} /> : null}
    </div>
  );
}
