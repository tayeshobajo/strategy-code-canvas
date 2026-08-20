/**
 * Gentle, plain-language validation for the Founder Signal Packet review step.
 *
 * Pure and client-safe. Every message is written as something a person would
 * say out loud, never as a form error.
 */

export type FieldKey = "name" | "email" | "company" | "website" | "phone";

export const FIELD_HINTS: Record<FieldKey, string> = {
  name: "However you'd like to be addressed.",
  email: "Where the next step should land.",
  company: "The name people know you by.",
  website: "If you have one. A plain address is fine, like trusttai.com.",
  phone: "Only if you'd rather we call.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_OK = /^[0-9+()\-.\s]{7,20}$/;
const WEBSITE_OK = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/;

/** One field. Returns a spoken correction, or null when the value is fine. */
export function validateField(key: FieldKey, raw: string): string | null {
  const value = (raw ?? "").trim();
  switch (key) {
    case "email":
      if (!value) return "An email address is the one thing I need.";
      if (value.length > 255) return "That email looks too long to be right.";
      if (!EMAIL.test(value)) return "That doesn't look like a complete email address yet.";
      return null;
    case "name":
      if (value.length > 100) return "Could you shorten your name a little?";
      return null;
    case "company":
      if (value.length > 120) return "Could you shorten the company name a little?";
      return null;
    case "website":
      if (!value) return null;
      if (value.length > 255) return "That address looks too long to be right.";
      if (!WEBSITE_OK.test(value)) return "That doesn't look like a web address yet.";
      return null;
    case "phone":
      if (!value) return null;
      if (!PHONE_OK.test(value)) return "That phone number has characters I can't read.";
      return null;
    default:
      return null;
  }
}

export type ContactLike = {
  name: string;
  email: string;
  company: string;
  website: string;
  phone: string;
};

/** Every field at once. Empty object means the packet is ready to send. */
export function validateContact(contact: ContactLike): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  (Object.keys(FIELD_HINTS) as FieldKey[]).forEach((k) => {
    const message = validateField(k, contact[k] ?? "");
    if (message) out[k] = message;
  });
  return out;
}

export const ANSWER_MAX = 4000;

/** A corrected answer in the review step. */
export function validateAnswer(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return "This can't be empty. Remove nothing, or put it back as it was.";
  if (value.length > ANSWER_MAX) return `That's longer than I can keep. Trim it to ${ANSWER_MAX} characters.`;
  return null;
}
