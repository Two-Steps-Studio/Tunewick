/** A paragraph, or a bulleted list. Strings may contain {operator}, {address}, {email}, {version}. */
export type LegalBlock = string | { list: string[] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  lead: string;
  sections: LegalSection[];
}

export type LegalDocumentKey = "terms" | "artistTerms" | "privacy" | "contentPolicy";

export interface LegalContent {
  draftNotice: string;
  contents: string;
  missing: string;
  /** How a missing operator detail is named in the "to be completed" marker. */
  fields: { operator: string; address: string; email: string };
  documents: Record<LegalDocumentKey, LegalDocument>;
}

/** Version of every legal document; also stored with each artist rights declaration. */
export const LEGAL_VERSION = "draft-2026-10";
