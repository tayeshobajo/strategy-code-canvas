/**
 * Bounded, non-sensitive shaping for first-party website events.
 *
 * Analytics carries behaviour, never content. Founder answers, contact
 * details, credentials and query-string secrets must never leave the browser
 * inside an event, and Core's receiver expects flat UTM fields.
 */

import type { WebsiteEvent, WebsiteEventName } from "./core-contract";
import { WEBSITE_EVENT_NAMES } from "./core-contract";

/** Property keys that may carry human content or secrets. Always dropped. */
export const SENSITIVE_PROPERTY_KEYS = [
  "answer",
  "answer_text",
  "text",
  "value",
  "content",
  "message",
  "note",
  "notes",
  "transcript",
  "summary",
  "question_text",
  "prompt",
  "email",
  "phone",
  "name",
  "company",
  "password",
  "token",
  "secret",
  "key",
  "api_key",
  "apikey",
  "authorization",
  "auth",
  "code",
  "otp",
  "query",
  "search",
];

const MAX_PROPERTIES = 10;
const MAX_STRING = 120;

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_PROPERTY_KEYS.some((s) => k === s || k.endsWith(`_${s}`) || k.includes(s));
}

/** Keep short scalars under safe keys. Everything else is dropped. */
export function sanitizeProperties(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROPERTIES) break;
    if (isSensitiveKey(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      // A long string is prose, not a bounded identifier.
      if (trimmed.length > MAX_STRING) continue;
      out[key] = trimmed;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function isWebsiteEventName(name: string): name is WebsiteEventName {
  return (WEBSITE_EVENT_NAMES as readonly string[]).includes(name);
}

type LegacyEvent = Partial<WebsiteEvent> & {
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
  } | null;
};

const str = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Normalise any event shape (including legacy nested-`utm` rows already in the
 * outbox) into exactly what Core accepts.
 */
export function normalizeEvent(input: LegacyEvent): WebsiteEvent | null {
  const name = typeof input.event_name === "string" ? input.event_name : "";
  if (!isWebsiteEventName(name)) return null;
  const key = str(input.event_key, 300);
  if (!key) return null;
  const utm = input.utm ?? {};
  return {
    event_key: key,
    event_name: name,
    occurred_at: str(input.occurred_at, 40) ?? new Date().toISOString(),
    session_id: str(input.session_id, 120),
    submission_id: str(input.submission_id, 120),
    path: str(input.path, 500),
    referrer: str(input.referrer, 500),
    utm_source: str(input.utm_source ?? utm.source, 200),
    utm_medium: str(input.utm_medium ?? utm.medium, 200),
    utm_campaign: str(input.utm_campaign ?? utm.campaign, 200),
    utm_term: str(input.utm_term ?? utm.term, 200),
    utm_content: str(input.utm_content ?? utm.content, 200),
    device: str(input.device, 40),
    properties: sanitizeProperties(input.properties),
  };
}
