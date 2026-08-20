/**
 * Research authorization must survive the whole Website -> Core path with
 * three distinct meanings: explicit yes, explicit no, and never asked.
 */

import { describe, expect, it } from "vitest";
import { buildScoutPayload } from "./session.server";
import { toCoreIntakeBody } from "./core-contract";
import { EMPTY_ATTRIBUTION } from "./attribution";
import type { IntakeConsent, VerbatimAnswer } from "./types";

const verbatim: VerbatimAnswer[] = [
  {
    key: "future_day",
    question: "What does the good day look like?",
    answer: "Calm mornings and a team that knows what matters.",
    modality: "text",
    media_ref: null,
    answered_at: "2026-01-01T00:00:00.000Z",
  },
];

function coreBodyFor(consent: IntakeConsent) {
  const payload = buildScoutPayload({
    id: "22222222-2222-2222-2222-222222222222",
    attribution: { ...EMPTY_ATTRIBUTION, session_id: "sess_live" },
    person: { name: "Jane", email: "jane@example.com", phone: null, role: null },
    company: { name: "Acme", website: "acme.com" },
    consent,
    verbatim,
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:10:00.000Z",
    skipped: [],
    followUpsAsked: [],
  });
  return toCoreIntakeBody(payload);
}

describe("research authorization on the live submission path", () => {
  it("delivers an explicit yes as true", () => {
    const body = coreBodyFor({
      contact_ok: true,
      marketing_ok: false,
      research_ok: true,
      agreed_at: "2026-01-01T00:10:00.000Z",
    });
    expect(body.signals.authorizes_research).toBe(true);
    expect(body.consent.marketing_opt_in).toBe(false);
  });

  it("delivers an explicit no as false, not null", () => {
    const body = coreBodyFor({
      contact_ok: true,
      marketing_ok: false,
      research_ok: false,
      agreed_at: "2026-01-01T00:10:00.000Z",
    });
    expect(body.signals.authorizes_research).toBe(false);
  });

  it("leaves never-asked as null", () => {
    const body = coreBodyFor({
      contact_ok: true,
      marketing_ok: false,
      agreed_at: "2026-01-01T00:10:00.000Z",
    });
    expect(body.signals.authorizes_research).toBeNull();
  });

  it("keeps marketing consent independent of research permission", () => {
    const yesMarketingNoResearch = coreBodyFor({
      contact_ok: true,
      marketing_ok: true,
      research_ok: false,
      agreed_at: "2026-01-01T00:10:00.000Z",
    });
    expect(yesMarketingNoResearch.consent.marketing_opt_in).toBe(true);
    expect(yesMarketingNoResearch.signals.authorizes_research).toBe(false);
  });
});
