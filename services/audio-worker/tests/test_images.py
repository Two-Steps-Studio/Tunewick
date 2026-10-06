from __future__ import annotations

import io

from PIL import Image, ImageCms

from tunewick_audio.images import process_image


def save(image: Image.Image, path, fmt: str, **options) -> str:
    image.save(path, fmt, **options)
    return str(path)


def photo(size=(1600, 1600), color=(200, 40, 60)) -> Image.Image:
    image = Image.new("RGB", size, color)
    image.paste((20, 20, 20), (0, 0, size[0] // 4, size[1] // 4))
    return image


def test_cover_becomes_webp_sizes_without_any_metadata(tmp_path):
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {2: (50.0, 15.0, 0.0), 4: (19.0, 2.0, 0.0)}  # GPS: Katowice
    source = save(photo(), tmp_path / "cover.jpg", "JPEG", exif=exif, comment=b"secret")

    report = process_image(source, "release_artwork", str(tmp_path / "out"))
    assert report["status"] == "accepted", report["rejection"]
    assert [v["width"] for v in report["variants"]] == [160, 320, 640, 1280, 1600]
    # The main colour (JPEG may shift a channel by one step).
    color = tuple(int(report["dominant_color"][i : i + 2], 16) for i in (1, 3, 5))
    assert all(abs(a - b) <= 3 for a, b in zip(color, (200, 40, 60), strict=True))
    for variant in report["variants"]:
        with Image.open(variant["path"]) as out:
            assert out.format == "WEBP"
            assert out.size == (variant["width"], variant["width"])
            assert not out.getexif()
            assert "exif" not in out.info and "icc_profile" not in out.info
            assert "comment" not in out.info


def test_large_cover_is_capped(tmp_path):
    source = save(photo((3000, 3000)), tmp_path / "big.png", "PNG")
    report = process_image(source, "release_artwork", str(tmp_path / "out"))
    assert [v["width"] for v in report["variants"]] == [160, 320, 640, 1280, 2400]


def test_camera_orientation_is_applied_before_metadata_is_dropped(tmp_path):
    image = Image.new("RGB", (1500, 1500), (255, 255, 255))
    image.paste((0, 0, 0), (0, 0, 1500, 300))  # black band on top
    exif = Image.Exif()
    exif[0x0112] = 3  # rotate 180°
    source = save(image, tmp_path / "rotated.jpg", "JPEG", exif=exif)
    report = process_image(source, "release_artwork", str(tmp_path / "out"))
    with Image.open(report["variants"][-1]["path"]) as out:
        assert out.getpixel((750, 1450))[0] < 40  # band is now at the bottom
        assert out.getpixel((750, 50))[0] > 215


def test_embedded_colour_profile_is_applied_and_removed(tmp_path):
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    source = save(photo((1500, 1500)), tmp_path / "profiled.png", "PNG", icc_profile=icc)
    report = process_image(source, "release_artwork", str(tmp_path / "out"))
    assert report["status"] == "accepted"
    with Image.open(report["variants"][-1]["path"]) as out:
        assert "icc_profile" not in out.info


def test_transparent_png_is_flattened_on_white(tmp_path):
    image = Image.new("RGBA", (1400, 1400), (0, 0, 0, 0))
    source = save(image, tmp_path / "alpha.png", "PNG")
    report = process_image(source, "release_artwork", str(tmp_path / "out"))
    with Image.open(report["variants"][0]["path"]) as out:
        assert out.convert("RGB").getpixel((10, 10)) == (255, 255, 255)


def test_artist_photo_is_centre_cropped(tmp_path):
    source = save(photo((600, 900)), tmp_path / "artist.webp", "WEBP")
    report = process_image(source, "artist_image", str(tmp_path / "out"))
    assert report["status"] == "accepted"
    assert [v["width"] for v in report["variants"]] == [160, 320, 600]


def rejection(tmp_path, source: str, kind: str = "release_artwork") -> str:
    report = process_image(source, kind, str(tmp_path / "out"))
    assert report["status"] == "rejected"
    assert report["variants"] == []
    return report["rejection"]["code"]


def test_rejections(tmp_path):
    assert (
        rejection(tmp_path, save(photo((1000, 1000)), tmp_path / "small.jpg", "JPEG"))
        == "too_small"
    )
    assert (
        rejection(tmp_path, save(photo((1600, 1400)), tmp_path / "wide.jpg", "JPEG"))
        == "not_square"
    )
    assert (
        rejection(tmp_path, save(photo((300, 300)), tmp_path / "a.png", "PNG"), "artist_image")
        == "too_small"
    )

    gif = save(photo((1500, 1500)), tmp_path / "cover.gif", "GIF")
    assert rejection(tmp_path, gif) == "unsupported_format"

    svg = tmp_path / "cover.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    assert rejection(tmp_path, str(svg)) == "unreadable"

    data = io.BytesIO()
    photo().save(data, "JPEG")
    truncated = tmp_path / "truncated.jpg"
    truncated.write_bytes(data.getvalue()[: len(data.getvalue()) // 2])
    assert rejection(tmp_path, str(truncated)) == "unreadable"

    bomb = save(Image.new("1", (12000, 12000)), tmp_path / "bomb.png", "PNG")
    assert rejection(tmp_path, bomb) == "too_many_pixels"
