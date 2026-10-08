const PATHS = {
  play: "M7 4.5v15l12-7.5z",
  heart:
    "M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z",
  pause: "M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z",
  save: "M6 3.5h12v17l-6-4.2-6 4.2z",
  share: "M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v7h14v-7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  spark: "M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z",
  full: "M4 6h10M4 12h10M4 18h7M17 13v7l5-3.5z",
} as const;

export type IconName = keyof typeof PATHS;

/** Line icons for the feed (filled where the shape is a glyph: play, pause, spark). */
export function Icon({
  name,
  filled = false,
  size = 22,
}: {
  name: IconName;
  filled?: boolean;
  size?: number;
}) {
  const solid = filled || name === "play" || name === "pause" || name === "spark";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d={PATHS[name]}
        fill={solid ? "currentColor" : "none"}
        stroke={solid && name !== "save" && name !== "heart" ? "none" : "currentColor"}
        strokeWidth={name === "more" ? 3 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
