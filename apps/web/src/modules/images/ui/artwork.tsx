import type { ImageSources } from "../queries";

/**
 * A processed square image (cover or artist photo). The dominant colour fills the box while the
 * file loads; without an image the box stays a neutral tile — never a stock placeholder.
 * Plain <img>: variants are already resized WebP files (next/image would re-process them).
 */
export function Artwork({
  image,
  alt,
  sizes,
  className = "",
  priority = false,
}: {
  image: ImageSources | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`artwork ${className}`}
      style={image?.color ? { backgroundColor: image.color } : undefined}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants (see above)
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={sizes}
          alt={alt}
          width={image.width}
          height={image.width}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      ) : null}
    </div>
  );
}
