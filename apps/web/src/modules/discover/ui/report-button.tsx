"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { type ReportInput, reportContent } from "../actions";

const CATEGORIES = ["copyright", "inappropriate", "spam", "impersonation", "other"] as const;

/** Report a song, artist or user to the moderators (signed-in listeners). */
export function ReportButton({
  subjectType,
  subjectId,
  name,
  className = "feed-menu__item",
}: {
  subjectType: ReportInput["subjectType"];
  subjectId: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations("Report");
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<"sent" | "signIn" | "limit" | "failed" | "invalid" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setResult(null);
          dialog.current?.showModal();
        }}
      >
        {t("open")}
      </button>
      <dialog ref={dialog} className="report-dialog" aria-labelledby={`report-${subjectId}`}>
        <form
          method="dialog"
          className="report-dialog__form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              const response = await reportContent({
                subjectType,
                subjectId,
                category: String(data.get("category")) as ReportInput["category"],
                details: String(data.get("details") ?? ""),
              });
              setResult(response.ok ? "sent" : response.error);
            });
          }}
        >
          <h2 id={`report-${subjectId}`} className="report-dialog__title">
            {t("title", { name })}
          </h2>
          {result === "sent" ? (
            <p role="status">{t("sent")}</p>
          ) : (
            <>
              <fieldset className="report-dialog__choices">
                <legend>{t("why")}</legend>
                {CATEGORIES.map((category, index) => (
                  <label key={category} className="report-dialog__choice">
                    <input
                      type="radio"
                      name="category"
                      value={category}
                      defaultChecked={index === 0}
                      required
                    />
                    {t(`categories.${category}`)}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                <span className="field__label">{t("details")}</span>
                <textarea name="details" maxLength={2000} rows={3} className="field__input" />
              </label>
              {result ? (
                <p role="alert" className="field__error">
                  {t(`errors.${result}`)}
                </p>
              ) : null}
            </>
          )}
          <div className="report-dialog__buttons">
            {result === "sent" ? null : (
              <button
                type="submit"
                className="button button--primary"
                disabled={pending}
                aria-busy={pending}
              >
                {t("submit")}
              </button>
            )}
            <button type="button" className="button" onClick={() => dialog.current?.close()}>
              {result === "sent" ? t("close") : t("cancel")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
