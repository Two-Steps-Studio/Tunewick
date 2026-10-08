import type { DiscoveryMode, Journey, Reason, WhyLine } from "@tunewick/shared";
import type { ImageSources } from "@/modules/images";

/** One card of the Discover feed — everything the client needs, nothing private. */
export interface FeedItem {
  trackId: string;
  code: string;
  title: string;
  durationMs: number | null;
  explicit: boolean;
  artist: { id: string; slug: string; name: string; verified: boolean };
  release: { id: string; slug: string; title: string };
  countryCode: string | null;
  city: string | null;
  genres: { id: number; slug: string; name: string }[];
  cover: ImageSources | null;
  preview: {
    startMs: number;
    lengthMs: number;
    /** The artist chose this excerpt (soundcheck). */
    chosen: boolean;
    /** AAC variants (lowest first). Empty when media delivery is not configured. */
    sources: { tier: "data_saver" | "high"; url: string }[];
  };
  reason: Reason;
  /** "Why this song?": message keys and real values (Why namespace). */
  why: WhyLine[];
  exploration: boolean;
  /** Library state for a signed-in listener; null for visitors. */
  liked: boolean | null;
  saved: boolean | null;
  following: boolean | null;
}

export interface FeedPage {
  items: FeedItem[];
  mode: DiscoveryMode;
  signedIn: boolean;
  /** Last page: nothing left to show in this mode. */
  done: boolean;
  /** The seed of this page; the client asks for the next pages with seed + n. */
  seed: number;
  /** The lens the feed is in (Surprise Me journey, "similar to"), kept for the next pages. */
  journey: Journey | null;
  similar: string | null;
}

/** Listener preferences (database for accounts, a cookie for visitors). */
export interface DiscoveryPreferences {
  countryCode: string | null;
  city: string | null;
  languages: string[];
  genreIds: number[];
  mode: DiscoveryMode;
  explorationShare: number;
  hideExplicit: boolean;
  showInRankings: boolean;
  timeZone: string;
  onboarded: boolean;
}
