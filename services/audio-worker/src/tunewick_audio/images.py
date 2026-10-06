"""Artwork and artist images (docs/security.md §5.5, architecture.md §11).

Uploaded images are never served as they are. Each one is decoded with Pillow (in the same
isolated worker container as ffmpeg), checked, converted to sRGB, and re-encoded from raw pixels
to WebP at fixed sizes — which drops EXIF (including GPS), ICC profiles, comments and anything
hidden after the image data, and neutralizes malformed files.
"""

from __future__ import annotations

import hashlib
import io
import os
import warnings
from dataclasses import dataclass

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 80_000_000  # ~ 9000 × 9000; checked before any pixel is decoded
SQUARE_TOLERANCE = 0.01
WEBP_QUALITY = 82


@dataclass(frozen=True)
class ImageRules:
    min_side: int
    require_square: bool  # covers must already be square; artist photos are centre-cropped
    sizes: tuple[int, ...]
    max_side: int


RULES = {
    # audio.md §2.1: ≥ 1400 × 1400 required, ≥ 3000 recommended; stores keep a 2400 px maximum.
    "release_artwork": ImageRules(1400, True, (160, 320, 640, 1280), 2400),
    "artist_image": ImageRules(400, False, (160, 320, 640), 1280),
}


class ImageRejected(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _open(path: str) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(path)
            if probe.format not in FORMATS:
                raise ImageRejected(
                    "unsupported_format", "Only JPEG, PNG and WebP images are accepted."
                )
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise ImageRejected("too_many_pixels", "The image has too many pixels.")
            if getattr(probe, "n_frames", 1) > 1:
                raise ImageRejected("animated", "Animated images are not accepted.")
            probe.verify()  # structure and checksums, without decoding pixels

            image = Image.open(path)  # verify() leaves the object unusable
            image.load()  # full decode: truncated or corrupt data fails here
            return image
    except ImageRejected:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ImageRejected("too_many_pixels", "The image has too many pixels.") from error
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        raise ImageRejected("unreadable", "The file could not be read as an image.") from error


def _to_srgb(image: Image.Image) -> Image.Image:
    """Applies the embedded colour profile (if any) and returns plain RGB pixels."""
    image = ImageOps.exif_transpose(image)  # honour the camera orientation before EXIF is dropped
    icc = image.info.get("icc_profile")
    if image.mode in ("RGBA", "LA", "P") or (image.mode == "P" and "transparency" in image.info):
        image = image.convert("RGBA")
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, image)
    if icc:
        try:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            target = ImageCms.createProfile("sRGB")
            image = ImageCms.profileToProfile(
                image.convert("RGB"), source, target, outputMode="RGB"
            )
        except (ImageCms.PyCMSError, OSError):
            pass  # a broken profile must not reject the image; fall back to the raw pixels
    return image.convert("RGB")


def _dominant_color(image: Image.Image) -> str:
    small = image.resize((64, 64), Image.Resampling.BOX)
    quantized = small.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    _count, index = max(quantized.getcolors() or [(1, 0)])
    r, g, b = palette[index * 3 : index * 3 + 3]
    return f"#{r:02x}{g:02x}{b:02x}"


def process_image(path: str, kind: str, out_dir: str) -> dict:
    """Returns a report; `variants` lists the WebP files written to `out_dir`."""
    rules = RULES[kind]
    with open(path, "rb") as handle:
        original = handle.read()
    report: dict = {
        "status": "rejected",
        "rejection": None,
        "input": {"bytes": len(original), "sha256": _sha256(original)},
        "variants": [],
    }
    try:
        image = _open(path)
        report["input"].update(format=image.format, width=image.width, height=image.height)
        image = _to_srgb(image)
        width, height = image.size
        side = min(width, height)
        if side < rules.min_side:
            raise ImageRejected(
                "too_small", f"The image must be at least {rules.min_side} × {rules.min_side} px."
            )
        if rules.require_square and abs(width - height) > SQUARE_TOLERANCE * max(width, height):
            raise ImageRejected("not_square", "Artwork must be square.")
        image = ImageOps.fit(image, (side, side), Image.Resampling.LANCZOS)

        os.makedirs(out_dir, exist_ok=True)
        largest = min(side, rules.max_side)
        for size in sorted({s for s in rules.sizes if s < largest} | {largest}):
            resized = (
                image if size == side else image.resize((size, size), Image.Resampling.LANCZOS)
            )
            buffer = io.BytesIO()
            # Fresh pixels only: no exif=, no icc_profile= → nothing from the upload survives.
            resized.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
            data = buffer.getvalue()
            file_path = os.path.join(out_dir, f"{size}.webp")
            with open(file_path, "wb") as handle:
                handle.write(data)
            report["variants"].append(
                {"width": size, "path": file_path, "bytes": len(data), "sha256": _sha256(data)}
            )
        report.update(
            status="accepted", width=largest, height=largest, dominant_color=_dominant_color(image)
        )
    except ImageRejected as rejection:
        report["rejection"] = {"code": rejection.code, "message": rejection.message}
        report["variants"] = []
    return report
