export type ReportSubject = "artist" | "release" | "playlist";
export type ReportReason = "copyright" | "illegal" | "hate" | "impersonation" | "spam" | "other";
export type ModerationAction = "dismiss" | "takedown_release" | "suspend_artist" | "hide_playlist";

export const REPORT_SUBJECTS: readonly ReportSubject[] = ["artist", "release", "playlist"];
export const REPORT_REASONS: readonly ReportReason[] = [
  "copyright",
  "illegal",
  "hate",
  "impersonation",
  "spam",
  "other",
];
