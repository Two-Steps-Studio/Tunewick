/**
 * A single-series bar chart rendered on the server as SVG: thin bars with rounded data ends on a
 * shared baseline, 2px gaps, a hover tooltip on every bar (larger than the bar), a few axis labels,
 * and the same numbers as a table for screen readers and anyone who prefers one.
 */

export interface Bar {
  /** Short axis label (shown for some bars). */
  label: string;
  /** Full label for the tooltip and the table. */
  name: string;
  value: number;
  /** The value as people read it (e.g. "1 h 20 min"). */
  display: string;
}

const HEIGHT = 120;
const RADIUS = 4;

/** A bar with rounded top corners only, anchored to the baseline. */
function barPath(x: number, width: number, height: number) {
  const r = Math.min(RADIUS, width / 2, height);
  const top = HEIGHT - height;
  return `M${x},${HEIGHT}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${HEIGHT}Z`;
}

export function BarChart({
  title,
  bars,
  tableLabel,
  columns,
  labelEvery = 1,
}: {
  title: string;
  bars: Bar[];
  tableLabel: string;
  columns: [string, string];
  /** Show every n-th axis label (the rest stay in tooltips and the table). */
  labelEvery?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = 12;
  const gap = 2;
  const width = bars.length * slot;
  return (
    <figure className="bar-chart">
      <figcaption className="bar-chart__title">{title}</figcaption>
      <svg
        className="bar-chart__plot"
        viewBox={`0 0 ${width} ${HEIGHT + 16}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={title}
      >
        <line className="bar-chart__base" x1={0} x2={width} y1={HEIGHT + 0.5} y2={HEIGHT + 0.5} />
        {bars.map((bar, i) => {
          const h = bar.value > 0 ? Math.max(2, (bar.value / max) * (HEIGHT - 4)) : 0;
          return (
            <g key={i} className="bar-chart__bar">
              <title>{`${bar.name}: ${bar.display}`}</title>
              <rect className="bar-chart__hit" x={i * slot} y={0} width={slot} height={HEIGHT} />
              {h > 0 ? <path d={barPath(i * slot + gap / 2, slot - gap, h)} /> : null}
            </g>
          );
        })}
      </svg>
      <div className="bar-chart__axis" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={i}>{i % labelEvery === 0 ? bar.label : ""}</span>
        ))}
      </div>
      <details className="bar-chart__table">
        <summary>{tableLabel}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{columns[0]}</th>
              <th scope="col">{columns[1]}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar, i) => (
              <tr key={i}>
                <th scope="row">{bar.name}</th>
                <td>{bar.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
