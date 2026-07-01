// Trust Tai roadmap review console — operator allowlist.
// Single hardcoded email. Add more by appending to this array.
export const OPERATOR_EMAILS: ReadonlyArray<string> = [
  "tai@trust-tai.com",
  "henry@trust-tai.com",
];

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}
