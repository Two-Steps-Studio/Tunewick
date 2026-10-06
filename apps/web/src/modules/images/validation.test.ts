import { describe, expect, it } from "vitest";
import { checkImageFile } from "./validation";

describe("checkImageFile", () => {
  it("accepts JPEG, PNG and WebP", () => {
    expect(checkImageFile("Okładka.JPG", 2_000_000)).toBeNull();
    expect(checkImageFile("cover.png", 2_000_000)).toBeNull();
    expect(checkImageFile("cover.webp", 2_000_000)).toBeNull();
  });

  it("refuses SVG, GIF and files without an extension", () => {
    expect(checkImageFile("logo.svg", 5000)).toBe("unsupported_type");
    expect(checkImageFile("anim.gif", 5000)).toBe("unsupported_type");
    expect(checkImageFile("cover", 5000)).toBe("unsupported_type");
  });

  it("checks the size limits", () => {
    expect(checkImageFile("tiny.png", 10)).toBe("too_small");
    expect(checkImageFile("huge.png", 30 * 1024 * 1024)).toBe("too_large");
  });
});
