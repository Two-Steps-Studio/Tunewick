import { describe, expect, it } from "vitest";
import { checkMasterFile } from "./validation";

describe("checkMasterFile", () => {
  it("accepts lossless masters regardless of extension case", () => {
    expect(checkMasterFile("Final Master.WAV", 50_000_000)).toBeNull();
    expect(checkMasterFile("track.flac", 20_000_000)).toBeNull();
    expect(checkMasterFile("alac.m4a", 20_000_000)).toBeNull();
    expect(checkMasterFile("take.aiff", 20_000_000)).toBeNull();
  });

  it("refuses lossy files and files without an extension", () => {
    expect(checkMasterFile("single.mp3", 5_000_000)).toBe("unsupported_type");
    expect(checkMasterFile("single.ogg", 5_000_000)).toBe("unsupported_type");
    expect(checkMasterFile("master", 5_000_000)).toBe("unsupported_type");
  });

  it("checks the size limits", () => {
    expect(checkMasterFile("tiny.wav", 100)).toBe("too_small");
    expect(checkMasterFile("huge.wav", 5 * 1024 ** 3)).toBe("too_large");
  });
});
