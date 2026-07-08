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
