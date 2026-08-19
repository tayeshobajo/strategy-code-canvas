/**
 * Browser-side event emitter.
 *
 * Fire-and-forget: analytics must never block or break the conversation.
 * Event keys are stable so retries dedupe in Core.
 */

import { trackWebsiteEvents } from "@/lib/website-intake.functions";
import { readAttribution } from "./attribution";
import type { WebsiteEventName } from "./core-contract";

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

export function trackEvent(input: TrackInput): void {
  if (typeof window === "undefined") return;
  try {
    const a = readAttribution();
    const sessionId = a.session_id;
    const event = {
      event_key: `${sessionId ?? "anon"}:${input.name}:${input.dedupe}`,
      event_name: input.name,
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      submission_id: input.submissionId ?? null,
      path: window.location.pathname,
      referrer: document.referrer || null,
      utm: {
        source: a.utm_source,
        medium: a.utm_medium,
        campaign: a.utm_campaign,
        term: a.utm_term,
        content: a.utm_content,
      },
      device: deviceHint(),
      properties: input.properties ?? {},
    };
    void trackWebsiteEvents({ data: { events: [event] } }).catch(() => {
      /* analytics is best effort */
    });
  } catch {
    /* never surface analytics failures */
  }
}
