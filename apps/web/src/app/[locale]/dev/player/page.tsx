import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { trackFromWorkerReport, type PlayerTrack, type WorkerReport } from "@/modules/player";
import { DevPlayer } from "./dev-player";

export const metadata: Metadata = { title: "Player test", robots: { index: false } };

const ALBUM_TRACKS = 3;

/** The sweep album rendered by the real audio worker (pnpm dev:media); empty when missing. */
async function loadAlbum(): Promise<PlayerTrack[]> {
  const tracks: PlayerTrack[] = [];
  for (let n = 1; n <= ALBUM_TRACKS; n++) {
    const file = path.join(process.cwd(), "public", "dev-media", "album", String(n), "report.json");
    let report: WorkerReport;
    try {
      report = JSON.parse(await readFile(file, "utf8")) as WorkerReport;
    } catch {
      return [];
    }
    const track = trackFromWorkerReport(
      report,
      { id: `dev-sweep-${n}`, title: `Sweep ${n}`, artist: "Tunewick test signal" },
      (name) => `/dev-media/album/${n}/${name}`,
    );
    if (track) tracks.push(track);
  }
  return tracks;
}

export default async function Page({ params }: PageProps<"/[locale]/dev/player">) {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.TUNEWICK_DEV_PAGES !== "1") notFound();
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <DevPlayer tracks={await loadAlbum()} />;
}
