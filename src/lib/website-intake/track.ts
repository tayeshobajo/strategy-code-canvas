/**
 * Browser-side event emitter.
 *
 * Fire-and-forget: analytics must never block or break the conversation.
 * Event keys are stable so retries dedupe in Core, and nothing sensitive
 * ever leaves the page.
 */

import { trackWebsiteEvents } from "@/lib/website-intake.functions";
import { readAttribution } from "./attribution";
import type { WebsiteEventName } from "./core-contract";
import { sanitizeProperties } from "./event-sanitize";

export type TrackInput = {
  name: WebsiteEventName;
  /** Stable discriminator so the same real-world event always produces one key. */
  dedupe: string;
  submissionId?: string | null;
  properties?: Record<string, unknown>;
};

function deviceHint(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent ?? "";
  if (!ua) return null;
  return /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
}

/** Guards against React remounts firing the same event twice in one page life. */
const sentKeys = new Set<string>();

export function trackEvent(input: TrackInput): void {
  if (typeof window === "undefined") return;
  try {
    const a = readAttribution();
    const sessionId = a.session_id;
    const eventKey = `${sessionId ?? "anon"}:${input.name}:${input.dedupe}`;
    if (sentKeys.has(eventKey)) return;
    sentKeys.add(eventKey);
    const event = {
      event_key: eventKey,
      event_name: input.name,
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      submission_id: input.submissionId ?? null,
      path: window.location.pathname,
      referrer: document.referrer || null,
      utm_source: a.utm_source,
      utm_medium: a.utm_medium,
      utm_campaign: a.utm_campaign,
      utm_term: a.utm_term,
      utm_content: a.utm_content,
      device: deviceHint(),
      properties: sanitizeProperties(input.properties),
    };
    void trackWebsiteEvents({ data: { events: [event] } }).catch(() => {
      /* analytics is best effort */
    });
  } catch {
    /* never surface analytics failures */
  }
}

/** Named calls to action. Identifier only, never button copy that carries content. */
export function trackCta(cta: string, destination?: string): void {
  trackEvent({
    name: "cta_clicked",
    dedupe: `${cta}:${typeof window !== "undefined" ? window.location.pathname : ""}`,
    properties: { cta, destination: destination ?? null },
  });
}
