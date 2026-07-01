// Trust Tai roadmap review console — operator allowlist.
// Single hardcoded email. Add more by appending to this array.
export const OPERATOR_EMAILS: ReadonlyArray<string> = [
  "tai@trusttai.com",
  "henry@trusttai.com",
  // Legacy aliases retained for backward compatibility.
  "tai@trust-tai.com",
  "henry@trust-tai.com",
];

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}
