import { WORDMARK_PATH, WORDMARK_SPARK, WORDMARK_VIEWBOX } from "./wordmark-data";

/**
 * Tunewick wordmark (logo concept B "Split"), outlined to paths so it does not depend on
 * font loading. Ink follows currentColor; the i-dot square uses the logo accent (--spark, coral).
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`wordmark ${className}`}
      viewBox={WORDMARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <path d={WORDMARK_PATH} fill="currentColor" />
      <rect
        x={WORDMARK_SPARK.x}
        y={WORDMARK_SPARK.y}
        width={WORDMARK_SPARK.size}
        height={WORDMARK_SPARK.size}
        fill="var(--spark)"
      />
    </svg>
  );
}
