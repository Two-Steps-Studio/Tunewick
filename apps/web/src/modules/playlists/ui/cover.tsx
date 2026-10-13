import { Artwork, type ImageSources } from "@/modules/images";

/**
 * A playlist's cover, made from the music in it: four different release covers as a 2x2 mosaic,
 * otherwise the first one alone, and with none a flat tile with the title's first letter and the
 * brand spark (no stock image). Square, like every cover.
 */
export function PlaylistCover({
  title,
  images,
  sizes,
  className = "",
  priority = false,
}: {
  title: string;
  images: ImageSources[];
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (images.length >= 4) {
    return (
      <div className={`playlist-cover playlist-cover--mosaic ${className}`} aria-hidden="true">
        {images.slice(0, 4).map((image, i) => (
          <Artwork
            key={i}
            image={image}
            alt=""
            sizes={`calc((${sizes}) / 2)`}
            priority={priority}
          />
        ))}
      </div>
    );
  }
  if (images[0]) {
    return (
      <div className={`playlist-cover ${className}`} aria-hidden="true">
        <Artwork image={images[0]} alt="" sizes={sizes} priority={priority} />
      </div>
    );
  }
  return (
    <div className={`playlist-cover playlist-cover--empty ${className}`} aria-hidden="true">
      <span className="playlist-cover__letter">{[...title.trim()][0]?.toUpperCase() ?? "♪"}</span>
    </div>
  );
}
