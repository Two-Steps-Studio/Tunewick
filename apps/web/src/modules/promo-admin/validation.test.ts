import { describe, expect, it } from "vitest";
import { benefitValue, endOfDayInPoland, generateSchema, sharedSchema, toCsv } from "./validation";

describe("promo admin validation", () => {
  const batch = { count: "10", expiresOn: "", newAccountsDays: "" };

  it("needs a value for time-limited benefits but not for lifetime", () => {
    expect(generateSchema.safeParse({ ...batch, benefit: "premium_days", value: "" }).success).toBe(
      false,
    );
    expect(
      generateSchema.safeParse({ ...batch, benefit: "premium_lifetime", value: "" }).success,
    ).toBe(true);
    expect(
      generateSchema.safeParse({ ...batch, benefit: "premium_months", value: "121" }).success,
    ).toBe(false);
  });

  it("caps batches at 5000 codes and requires a count", () => {
    const base = { ...batch, benefit: "premium_days", value: "30" };
    expect(generateSchema.safeParse({ ...base, count: "5001" }).success).toBe(false);
    expect(generateSchema.safeParse({ ...base, count: "" }).success).toBe(false);
    expect(generateSchema.safeParse({ ...base, count: "50" }).success).toBe(true);
  });

  it("accepts readable shared codes and requires max uses", () => {
    const base = {
      benefit: "premium_days",
      value: "14",
      expiresOn: "2027-01-31",
      newAccountsDays: "",
    };
    expect(sharedSchema.safeParse({ ...base, code: "HIPNOZA-26", maxUses: "200" }).success).toBe(
      true,
    );
    expect(sharedSchema.safeParse({ ...base, code: "HIPNOZA-26", maxUses: "" }).success).toBe(
      false,
    );
    expect(sharedSchema.safeParse({ ...base, code: "ab", maxUses: "5" }).success).toBe(false);
  });

  it("ends a date at midnight in Poland and drops the value for lifetime", () => {
    expect(endOfDayInPoland("2027-01-31")).toBe("2027-01-31 23:59:59 Europe/Warsaw");
    expect(endOfDayInPoland(null)).toBeNull();
    expect(benefitValue({ benefit: "premium_lifetime", value: 30 })).toBeNull();
  });

  it("exports codes as CSV with the campaign quoted", () => {
    expect(toCsv(["AAAA-BBBB"], 'Klub "Hipnoza"')).toBe(
      'code,campaign\nAAAA-BBBB,"Klub ""Hipnoza"""\n',
    );
  });
});
