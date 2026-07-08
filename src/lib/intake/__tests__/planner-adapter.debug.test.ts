/**
 * Phase 14 — planner-adapter surface for window.__intakeDebug.
 */

import { describe, expect, it } from "vitest";
import { planNextObjective } from "../planner-adapter";

describe("planner-adapter snapshot", () => {
  it("exposes context_facts, selected_reason and candidates on an ask", () => {
    const snap = planNextObjective(
      "project.event_site",
      {
        [OPEN_KEY]: {
          key: OPEN_KEY,
          question: "opening",
          response:
            "I'm organizing my mother Augustina's 60th birthday on August 30 in Nashville with 120 guests.",
        },
      },
      [OPEN_KEY],
      { event_date: 90, guest_count: 90 },
    );
    expect(snap.frame).toBe("project.event_site");
    expect(snap.context_facts).toBeDefined();
    expect(Object.keys(snap.context_facts).length).toBeGreaterThan(0);
    expect(snap.selected_reason).toMatch(
      /^(top-ranked-required|clarify-low-confidence|optional-followup|enough-signal|no-gaps)$/,
    );
    expect(Array.isArray(snap.candidates)).toBe(true);
  });

  it("acknowledges honoree_or_host from opening statement", () => {
    const snap = planNextObjective(
      "project.event_site",
      {
        [OPEN_KEY]: {
          key: OPEN_KEY,
          question: "opening",
          response:
            "Planning my mother Augustina's 60th birthday on August 30 in Nashville.",
        },
      },
      [OPEN_KEY],
      {},
    );
    expect(snap.context_facts.honoree_or_host?.value).toMatch(/Augustina/);
    expect(snap.context_facts.event_type?.value).toMatch(/birthday/i);
    expect(snap.context_facts.location?.value).toMatch(/Nashville/);
  });
});

const OPEN_KEY = "opening";
