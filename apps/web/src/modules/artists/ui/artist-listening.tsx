import { getFormatter, getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Listener numbers for the artist's team: closed months only, real counts (a play counts at 30 s,
 * soundchecks never). Says so plainly until the first month is closed.
 */
export async function ArtistListening({ artistId }: { artistId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_monthly_listening", { artist: artistId });
  if (error) throw error;
  const t = await getTranslations("Artists.listening");
  const format = await getFormatter();
  return (
    <section className="settings-form__group" aria-labelledby="listening">
      <h2 id="listening" className="section-title">
        {t("title")}
      </h2>
      <p className="field__hint">{t("lead")}</p>
      {data.length === 0 ? (
        <p className="field__hint">{t("empty")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t("month")}</th>
              <th scope="col">{t("listeners")}</th>
              <th scope="col">{t("plays")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month}>
                <th scope="row">
                  {format.dateTime(new Date(`${row.month}T12:00:00Z`), {
                    month: "long",
                    year: "numeric",
                  })}
                </th>
                <td>{row.listeners}</td>
                <td>{row.qualified_plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
