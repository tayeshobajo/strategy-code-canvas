/**
 * Phase 14 — multi-fact extraction.
 *
 * A single answer should populate multiple fields when the text carries
 * multiple recognisable signals. The extractor already iterates all fields
 * on the frame profile; these tests lock the shipping behaviour.
 */

import { describe, expect, it } from "vitest";
import { heuristicExtract } from "../heuristic-extract";

describe("heuristicExtract — multi-fact", () => {
  it("event_site: '150 guests on August 30' credits guest_count and event_date", () => {
    const facts = heuristicExtract(
      "project.event_site",
      "We're expecting 150 guests on August 30 in Nashville.",
    );
    expect(facts.guest_count?.confidence ?? 0).toBeGreaterThanOrEqual(0.6);
    expect(facts.event_date?.confidence ?? 0).toBeGreaterThanOrEqual(0.6);
  });

  it("event_site: RSVP + privacy from one line", () => {
    const facts = heuristicExtract(
      "project.event_site",
      "Invite-only site with RSVP that asks about dietary restrictions.",
    );
    expect(facts.privacy?.confidence ?? 0).toBeGreaterThan(0);
    expect(facts.rsvp_fields?.confidence ?? 0).toBeGreaterThan(0);
  });

  it("automation: trigger + volume + systems from one line", () => {
    const facts = heuristicExtract(
      "project.automation",
      "A new order in Stripe fires a webhook 200 a week and posts to Slack via Zapier.",
    );
    expect(facts.trigger?.confidence ?? 0).toBeGreaterThan(0);
    expect(facts.volume?.confidence ?? 0).toBeGreaterThanOrEqual(0.6);
    expect(facts.systems?.confidence ?? 0).toBeGreaterThan(0);
  });

  it("crm: sources + follow-up-gap from one line", () => {
    const facts = heuristicExtract(
      "project.crm",
      "Leads come from our website contact form but we forget to follow up so they fall through the cracks.",
    );
    expect(facts.sources?.confidence ?? 0).toBeGreaterThan(0);
    expect(facts.follow_up_gap?.confidence ?? 0).toBeGreaterThan(0);
  });
});

describe("extractContextFacts", () => {
  it("captures honoree, event type and location from a birthday opening", async () => {
    const { extractContextFacts } = await import("../heuristic-extract");
    const ctx = extractContextFacts(
      "project.event_site",
      "I'm planning my mother Augustina's 60th birthday on August 30 in Nashville with 120 guests.",
    );
    expect(ctx.honoree_or_host?.value).toMatch(/Augustina/);
    expect(ctx.event_type?.value).toMatch(/birthday/i);
    expect(ctx.location?.value).toMatch(/Nashville/);
  });

  it("captures founder_dependency for roadmap opens", async () => {
    const { extractContextFacts } = await import("../heuristic-extract");
    const ctx = extractContextFacts(
      "roadmap",
      "My business is growing but everything runs through me.",
    );
    expect(ctx.founder_dependency?.value).toBe("yes");
  });

  it("captures lead_source_hint + manual_process_hint for CRM opens", async () => {
    const { extractContextFacts } = await import("../heuristic-extract");
    const ctx = extractContextFacts(
      "project.crm",
      "I manually copy website leads into a spreadsheet, then email them later.",
    );
    expect(ctx.lead_source_hint?.value).toMatch(/website/);
    expect(ctx.manual_process_hint?.value).toMatch(/copy|spreadsheet|manually/);
  });
});
