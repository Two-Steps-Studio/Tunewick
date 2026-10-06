import { describe, expect, it } from "vitest";
import {
  creditSchema,
  rightsSchema,
  genresSchema,
  releaseDbError,
  releaseDetailsSchema,
  trackSchema,
} from "./validation";

const details = {
  title: " Pierwsza EPka ",
  slug: "Pierwsza-Epka",
  type: "ep",
  releaseDate: "",
  aiContent: "human",
  territory: "WORLD",
  upc: "",
  pLine: "",
  cLine: "",
};

describe("releaseDetailsSchema", () => {
  it("normalizes text and turns empty optional fields into null", () => {
    const r = releaseDetailsSchema.parse(details);
    expect(r.title).toBe("Pierwsza EPka");
    expect(r.slug).toBe("pierwsza-epka");
    expect(r.releaseDate).toBeNull();
    expect(r.explicit).toBe(false);
    expect(r.upc).toBeNull();
  });

  it("reads the explicit checkbox and validates dates and codes", () => {
    expect(releaseDetailsSchema.parse({ ...details, explicit: "on" }).explicit).toBe(true);
    expect(releaseDetailsSchema.parse({ ...details, releaseDate: "2026-11-20" }).releaseDate).toBe(
      "2026-11-20",
    );
    expect(releaseDetailsSchema.safeParse({ ...details, releaseDate: "20.11.2026" }).success).toBe(
      false,
    );
    expect(releaseDetailsSchema.safeParse({ ...details, upc: "123" }).success).toBe(false);
    expect(releaseDetailsSchema.safeParse({ ...details, territory: "US" }).success).toBe(false);
  });
});

describe("trackSchema", () => {
  it("uppercases and validates ISRC", () => {
    expect(trackSchema.parse({ title: "A", isrc: "plabc2600001", aiContent: "human" }).isrc).toBe(
      "PLABC2600001",
    );
    expect(trackSchema.safeParse({ title: "A", isrc: "PL-ABC", aiContent: "human" }).success).toBe(
      false,
    );
  });
});

describe("creditSchema and genresSchema", () => {
  it("validates credits and limits genres to three", () => {
    const credit = { name: "Ola", role: "performer", detail: "bas", artistSlug: "" };
    expect(creditSchema.safeParse({ ...credit, name: "" }).success).toBe(false);
    expect(creditSchema.parse(credit).detail).toBe("bas");
    expect(creditSchema.parse(credit).artistSlug).toBeNull();
    // A linked profile address is normalized and must look like an address.
    expect(creditSchema.parse({ ...credit, artistSlug: " Halda-Kolektyw " }).artistSlug).toBe(
      "halda-kolektyw",
    );
    expect(creditSchema.safeParse({ ...credit, artistSlug: "nie adres!" }).success).toBe(false);
    expect(genresSchema.safeParse(["1", "2", "3"]).success).toBe(true);
    expect(genresSchema.safeParse(["1", "2", "3", "4"]).success).toBe(false);
  });
});

describe("releaseDbError", () => {
  it("maps database errors", () => {
    expect(releaseDbError({ code: "23505" })).toEqual({ fieldErrors: { slug: "slugTaken" } });
    expect(
      releaseDbError({ code: "23514", message: "a release can have at most 3 genres" }),
    ).toEqual({ error: "tooManyGenres" });
    expect(releaseDbError({ code: "42501" })).toEqual({ error: "forbidden" });
  });
});

describe("rightsSchema", () => {
  const valid = {
    ownsMaster: "on",
    cmo: ["none"],
    samples: "none",
    samplesDescription: "",
    aiContent: "human",
    acceptTerms: "on",
  };

  it("accepts a complete declaration", () => {
    const r = rightsSchema.parse(valid);
    expect(r.controlsComposition).toBe(false);
    expect(r.cmo).toEqual(["none"]);
  });

  it("requires master rights, an answer about organizations, terms and a declared AI value", () => {
    const issues = (input: object) => {
      const r = rightsSchema.safeParse(input);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(issues({ ...valid, ownsMaster: undefined })).toContain("masterRequired");
    expect(issues({ ...valid, cmo: [] })).toContain("cmoRequired");
    expect(issues({ ...valid, cmo: ["none", "zaiks"] })).toContain("cmoNoneExclusive");
    expect(issues({ ...valid, acceptTerms: undefined })).toContain("termsRequired");
    expect(issues({ ...valid, aiContent: "unknown" })).toContain("aiRequired");
    expect(issues({ ...valid, samples: "cleared" })).toContain("samplesDescriptionRequired");
  });
});
