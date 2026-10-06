import { describe, expect, it } from "vitest";
import { profileErrorField, settingsSchema } from "./validation";

const base = {
  handle: "",
  displayName: "",
  bio: "",
  locale: "pl",
  activityVisibility: "followers",
};

describe("settingsSchema", () => {
  it("normalizes the handle and turns empty fields into null", () => {
    const result = settingsSchema.parse({ ...base, handle: "  Basista-Z-Gliwic " });
    expect(result.handle).toBe("basista-z-gliwic");
    expect(result.displayName).toBeNull();
    expect(result.bio).toBeNull();
  });

  it("rejects handles with spaces or diacritics", () => {
    for (const handle of ["ala ma", "żubr", "a"]) {
      expect(settingsSchema.safeParse({ ...base, handle }).success, handle).toBe(false);
    }
  });

  it("rejects unknown locales and visibility values", () => {
    expect(settingsSchema.safeParse({ ...base, locale: "de" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, activityVisibility: "friends" }).success).toBe(
      false,
    );
  });
});

describe("profileErrorField", () => {
  it("maps database constraint violations to fields", () => {
    expect(profileErrorField({ code: "23505" })).toEqual({ handle: "handleTaken" });
    expect(
      profileErrorField({
        code: "23514",
        message: 'violates check constraint "profiles_handle_not_reserved"',
      }),
    ).toEqual({ handle: "handleReserved" });
    expect(profileErrorField({ code: "42501" })).toBeNull();
  });
});
