import world from "../world-paths.json";

export interface MapCountry {
  code: string;
  /** Artists with music on Tunewick. */
  artists: number;
  /** The listener has heard music from here. */
  mine: boolean;
  href: string;
  label: string;
}

/** Artist counts to one of four steps of a single hue (0 = no music yet). */
export function step(artists: number): 0 | 1 | 2 | 3 | 4 {
  if (artists <= 0) return 0;
  if (artists === 1) return 1;
  if (artists < 5) return 2;
  if (artists < 20) return 3;
  return 4;
}

/**
 * The world as server-rendered SVG (Natural Earth 1:110m, Equal Earth projection, prebuilt by
 * scripts/build-world-map.mjs): countries shaded by how many artists they have, the listener's
 * own countries outlined, each country with music a link with a tooltip. The page lists the same
 * countries as text (the map is an extra, not the only way in).
 */
export function WorldMap({
  countries,
  title,
  legend,
}: {
  countries: MapCountry[];
  title: string;
  legend: { steps: [string, string, string, string]; none: string; mine: string | null };
}) {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const paths = world.paths as Record<string, string>;
  return (
    <figure className="world-map">
      <svg viewBox={world.viewBox} role="img" aria-label={title} className="world-map__svg">
        {Object.entries(paths).map(([code, d]) => {
          const country = byCode.get(code);
          if (!country || country.artists === 0) {
            return <path key={code} d={d} className="world-map__land" />;
          }
          return (
            <a key={code} href={country.href} aria-label={country.label}>
              <path
                d={d}
                className={`world-map__land world-map__land--${step(country.artists)}${country.mine ? " is-mine" : ""}`}
              >
                <title>{country.label}</title>
              </path>
            </a>
          );
        })}
      </svg>
      <figcaption className="world-map__legend">
        <span>
          <i className="world-map__swatch" /> {legend.none}
        </span>
        {legend.steps.map((label, i) => (
          <span key={label}>
            <i className={`world-map__swatch world-map__land--${i + 1}`} /> {label}
          </span>
        ))}
        {legend.mine ? (
          <span>
            <i className="world-map__swatch is-mine" /> {legend.mine}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
