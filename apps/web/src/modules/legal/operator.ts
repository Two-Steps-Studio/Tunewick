import "server-only";

/**
 * Who runs Tunewick, as the legal documents name it. Set in the hosting environment (Vercel) and
 * .env.local — never guessed: a missing value is shown in the document as "to be completed".
 *   LEGAL_OPERATOR_NAME     person or company running the service (e.g. a parent or guardian)
 *   LEGAL_OPERATOR_ADDRESS  postal address for legal correspondence
 *   LEGAL_CONTACT_EMAIL     contact for complaints, data requests and the DSA point of contact
 */
export function getOperator() {
  const value = (name: string) => process.env[name]?.trim() || null;
  return {
    operator: value("LEGAL_OPERATOR_NAME"),
    address: value("LEGAL_OPERATOR_ADDRESS"),
    email: value("LEGAL_CONTACT_EMAIL"),
  };
}
