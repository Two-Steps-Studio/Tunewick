export type ReportSubject = "artist" | "release" | "playlist" | "event" | "venue" | "profile";
export type ReportReason = "copyright" | "illegal" | "hate" | "impersonation" | "spam" | "other";
export type ModerationAction =
  | "dismiss"
  | "takedown_release"
  | "suspend_artist"
  | "hide_playlist"
  | "remove_event"
  | "clear_venue_details"
  | "reset_profile";

export const REPORT_SUBJECTS: readonly ReportSubject[] = [
  "artist",
  "release",
  "playlist",
  "event",
  "venue",
  "profile",
];
export const REPORT_REASONS: readonly ReportReason[] = [
  "copyright",
  "illegal",
  "hate",
  "impersonation",
  "spam",
  "other",
];
