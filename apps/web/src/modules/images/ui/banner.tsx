import type { ImageSources } from "../queries";

/**
 * A wide banner (3:1) across the top of an artist's or a listener's page: their own art, as large
 * as the page allows. Nothing is shown without one - no stock picture, no gradient filler.
 */
export function Banner({ image, alt }: { image: ImageSources | null; alt: string }) {
  if (!image) return null;
  return (
    <div className="banner" style={image.color ? { backgroundColor: image.color } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants */}
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes="(min-width: 1200px) 1200px, 100vw"
        alt={alt}
        width={image.width}
        height={Math.round(image.width / 3)}
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}
