import { getFormatter, getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Per-song numbers for the artist's team: the last 28 days of listening, and what listeners kept
 * doing with each song (saves, likes, playlists - all time). Counts only, never who. A table on
 * wide screens; on phones each song becomes a card with labelled numbers.
 */
export async function ArtistSongStats({ artistId }: { artistId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_track_stats", { artist: artistId });
  if (error) throw error;
  const t = await getTranslations("Artists.songStats");
  const format = await getFormatter();
  const n = (value: number) => format.number(value);
  const columns = [
    ["listeners", (row: (typeof data)[number]) => n(row.listeners_28d)],
    ["plays", (row: (typeof data)[number]) => n(row.plays_28d)],
    [
      "completion",
      (row: (typeof data)[number]) =>
        row.completion_rate == null
          ? "-"
          : format.number(Number(row.completion_rate), { style: "percent" }),
    ],
    ["saves", (row: (typeof data)[number]) => n(row.saves)],
    ["likes", (row: (typeof data)[number]) => n(row.likes)],
    ["playlists", (row: (typeof data)[number]) => n(row.playlist_adds)],
  ] as const;
  return (
    <section className="settings-form__group" aria-labelledby="song-stats">
      <h2 id="song-stats" className="section-title">
        {t("title")}
      </h2>
      <p className="field__hint">{t("lead")}</p>
      {data.length === 0 ? (
        <p className="field__hint">{t("empty")}</p>
      ) : (
        <div className="song-stats-box">
          <table className="song-stats">
            <thead>
              <tr>
                <th scope="col">{t("song")}</th>
                {columns.map(([key]) => (
                  <th scope="col" key={key}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.track_id}>
                  <th scope="row">
                    <span className="song-stats__title">{row.title}</span>
                    <span className="song-stats__release">{row.release_title}</span>
                  </th>
                  {columns.map(([key, value]) => (
                    <td key={key} data-label={t(key)}>
                      {value(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
