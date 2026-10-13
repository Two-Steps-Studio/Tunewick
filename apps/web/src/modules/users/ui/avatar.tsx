import type { ImageSources } from "@/modules/images";

/**
 * A person's picture, or the first letter of their name on a neutral circle when there is none.
 * Decorative by default: the link or heading next to it carries the name.
 */
export function Avatar({
  image,
  name,
  size,
}: {
  image: ImageSources | null;
  name: string | null;
  /** CSS size, e.g. "2rem". */
  size: string;
}) {
  const initial = name?.replace(/^@/, "").trim().charAt(0).toLocaleUpperCase() || "?";
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: `calc(${size} * 0.45)`,
        backgroundColor: image?.color ?? undefined,
      }}
      aria-hidden="true"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants
        <img src={image.src} srcSet={image.srcSet} sizes={size} alt="" />
      ) : (
        <span className="avatar__initial">{initial}</span>
      )}
    </span>
  );
}
