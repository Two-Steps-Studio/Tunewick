import { describe, expect, it } from "vitest";
import {
  authErrorCode,
  fieldErrorsFrom,
  safeNextPath,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./validation";

describe("signUpSchema", () => {
  const valid = {
    email: "  Ala@Example.COM ",
    password: "dlugie-haslo-123",
    displayName: "",
    ageConfirmed: "on",
  };

  it("normalizes email and drops an empty display name", () => {
    const result = signUpSchema.parse(valid);
    expect(result.email).toBe("ala@example.com");
    expect(result.displayName).toBeUndefined();
  });

  it("requires age confirmation", () => {
    const result = signUpSchema.safeParse({ ...valid, ageConfirmed: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsFrom(result.error)?.ageConfirmed).toBe("ageRequired");
  });

  it("rejects short and overlong passwords with distinct codes", () => {
    const short = signUpSchema.safeParse({ ...valid, password: "krotkie" });
    const long = signUpSchema.safeParse({ ...valid, password: "x".repeat(73) });
    expect(!short.success && fieldErrorsFrom(short.error)?.password).toBe("passwordTooShort");
    expect(!long.success && fieldErrorsFrom(long.error)?.password).toBe("passwordTooLong");
  });

  it("rejects invalid email", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(!result.success && fieldErrorsFrom(result.error)?.email).toBe("invalidEmail");
  });
});

describe("signInSchema", () => {
  it("requires a password but no minimum length (existing accounts)", () => {
    expect(signInSchema.safeParse({ email: "a@b.pl", password: "x" }).success).toBe(true);
    const empty = signInSchema.safeParse({ email: "a@b.pl", password: "" });
    expect(!empty.success && fieldErrorsFrom(empty.error)?.password).toBe("passwordRequired");
  });
});

describe("updatePasswordSchema", () => {
  it("reports mismatch on confirmPassword", () => {
    const result = updatePasswordSchema.safeParse({
      password: "nowe-haslo-123",
      confirmPassword: "inne-haslo-123",
    });
    expect(!result.success && fieldErrorsFrom(result.error)?.confirmPassword).toBe(
      "passwordMismatch",
    );
  });
});

describe("safeNextPath", () => {
  it("allows same-site absolute paths only", () => {
    expect(safeNextPath("/scena")).toBe("/scena");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("authErrorCode", () => {
  it("maps rate limits regardless of code", () => {
    expect(authErrorCode({ status: 429 })).toBe("rateLimited");
    expect(authErrorCode({ code: "over_email_send_rate_limit" })).toBe("rateLimited");
  });

  it("maps known codes and falls back to unexpected", () => {
    expect(authErrorCode({ code: "invalid_credentials" })).toBe("invalidCredentials");
    expect(authErrorCode({ code: "otp_expired" })).toBe("linkInvalid");
    expect(authErrorCode({ code: "user_already_exists" })).toBe("unexpected");
  });
});
