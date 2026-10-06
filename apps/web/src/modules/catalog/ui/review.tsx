"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { type SubmissionState, submitRelease, withdrawSubmission } from "../actions";

const initial: SubmissionState = {};

/** Send for review — offered only when the checklist is complete (the database checks again). */
export function SubmitReleaseForm({ releaseId }: { releaseId: string }) {
  const t = useTranslations("Releases.review");
  const [state, action, pending] = useActionState(() => submitRelease(releaseId), initial);
  return (
    <form action={action} className="review-submit">
      <button type="submit" className="button button--primary" disabled={pending}>
        {t("submit")}
      </button>
      <p className="field__hint">{t("submitHint")}</p>
      {state.error ? (
        <p className="form-error" role="alert">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}

/** Where the release stands in review, in the artist's words. */
export function ReviewStatus({
  release,
  artistSlug,
}: {
  release: {
    id: string;
    slug: string;
    status: string;
    submitted_at: string | null;
    publish_at: string | null;
    review_note: string | null;
  };
  artistSlug: string;
}) {
  const t = useTranslations("Releases.review");
  const format = useFormatter();
  const [state, withdraw, pending] = useActionState(() => withdrawSubmission(release.id), initial);
  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short" }) : "";

  if (release.status === "in_review") {
    return (
      <div className="review-status" role="status">
        <p>{t("inReview", { date: date(release.submitted_at) })}</p>
        <form action={withdraw}>
          <button type="submit" className="button button--quiet" disabled={pending}>
            {t("withdraw")}
          </button>
        </form>
        {state.error ? <p className="form-error">{t(`error.${state.error}`)}</p> : null}
      </div>
    );
  }
  if (release.status === "rejected" && release.review_note) {
    return (
      <div className="review-status review-status--returned" role="status">
        <p className="review-status__title">{t("returned")}</p>
        <blockquote className="review-status__note">{release.review_note}</blockquote>
        <p className="field__hint">{t("returnedHint")}</p>
      </div>
    );
  }
  if (release.status === "published") {
    const live = release.publish_at !== null && new Date(release.publish_at) <= new Date();
    return (
      <div className="review-status review-status--published" role="status">
        <p>
          {live
            ? t("published", { date: date(release.publish_at) })
            : t("scheduled", { date: date(release.publish_at) })}
        </p>
        {live ? (
          <Link
            href={{
              pathname: "/artists/[slug]/releases/[release]",
              params: { slug: artistSlug, release: release.slug },
            }}
          >
            {t("viewPublic")}
          </Link>
        ) : null}
      </div>
    );
  }
  return null;
}
