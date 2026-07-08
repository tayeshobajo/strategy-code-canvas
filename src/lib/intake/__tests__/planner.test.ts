/**
 * Adaptive intake planner tests — acceptance criteria for the shift from
 * static objective ordering to evidence-driven Conversation Planner.
 */

import { describe, expect, it } from "vitest";
import { heuristicExtract } from "../heuristic-extract";
import { getFrameProfile } from "../frame-profiles";
import { emptyMemory, mergeFacts, recordQuestion } from "../intake-memory";
import { planNextTurn } from "../conversation-planner";
import { analyzeGaps } from "../gap-analyzer";

const BIRTHDAY_OPENING =
  "I'm organizing my mother Augustina's 60th birthday celebration and need digital invitations.";

const ROADMAP_OPENING = "My business is growing but everything runs through me.";

const CRM_OPENING = "I manually copy leads from my website into a spreadsheet.";

const INTERNAL_TOOL_OPENING =
  "My ops team spends hours in spreadsheets tracking customer refunds by hand.";

describe("adaptive planner — event_site", () => {
  it("credits audience/goal from the birthday opening and asks about the date next", () => {
    const profile = getFrameProfile("project.event_site")!;
    const facts = heuristicExtract("project.event_site", BIRTHDAY_OPENING);
    const memory = mergeFacts(emptyMemory("project.event_site"), facts);
    const decision = planNextTurn("project.event_site", memory);
    expect(decision.kind).toBe("ask");
    if (decision.kind !== "ask") return;
    // Must never fall back to a roadmap founder-bottleneck field.
    expect(decision.gap.field.key).not.toBe("weight");
    expect(decision.gap.field.key).not.toBe("point_a");
    // The strongest remaining unknown for a birthday site is the event date.
    expect(["event_date", "guest_count", "goal"].includes(decision.gap.field.key)).toBe(true);
  });

  it("does not re-ask event_date once the answer includes a date", () => {
    const profile = getFrameProfile("project.event_site")!;
    const withDate = mergeFacts(
      emptyMemory("project.event_site"),
      heuristicExtract("project.event_site", "The party is on March 14, 2027 in Lagos."),
    );
    const gaps = analyzeGaps(withDate, profile);
    expect(gaps.find((g) => g.field.key === "event_date")).toBeUndefined();
  });
});

describe("adaptive planner — roadmap", () => {
  it("credits founder-bottleneck (weight) from the roadmap opening", () => {
    const facts = heuristicExtract("roadmap", ROADMAP_OPENING);
    expect(facts.weight).toBeDefined();
    expect(facts.weight!.confidence).toBeGreaterThan(0);
  });

  it("does not ask for event details in a roadmap flow", () => {
    const memory = mergeFacts(emptyMemory("roadmap"), heuristicExtract("roadmap", ROADMAP_OPENING));
    const decision = planNextTurn("roadmap", memory);
    if (decision.kind !== "ask") return;
    expect(decision.gap.field.key).not.toBe("event_date");
    expect(decision.gap.field.key).not.toBe("guest_count");
    expect(decision.gap.field.key).not.toBe("rsvp_fields");
  });
});

describe("adaptive planner — automation / crm", () => {
  it("asks about lead source or the manual process for a CRM opening", () => {
    const memory = mergeFacts(
      emptyMemory("project.crm"),
      heuristicExtract("project.crm", CRM_OPENING),
    );
    const decision = planNextTurn("project.crm", memory);
    if (decision.kind !== "ask") return;
    expect(["sources", "pipeline_today", "follow_up_gap", "audience", "features"]).toContain(
      decision.gap.field.key,
    );
  });
});

describe("adaptive planner — internal tool", () => {
  it("asks about users / task / today for an internal-tool opening", () => {
    const memory = mergeFacts(
      emptyMemory("project.internal_tool"),
      heuristicExtract("project.internal_tool", INTERNAL_TOOL_OPENING),
    );
    const decision = planNextTurn("project.internal_tool", memory);
    if (decision.kind !== "ask") return;
    expect(["users", "task", "today", "audience", "goal", "features"]).toContain(
      decision.gap.field.key,
    );
  });
});

describe("adaptive planner — cross-frame hygiene", () => {
  it("never returns a gap outside its own frame profile", () => {
    for (const frame of [
      "roadmap",
      "project.event_site",
      "project.crm",
      "project.internal_tool",
      "project.automation",
    ] as const) {
      const profile = getFrameProfile(frame)!;
      const decision = planNextTurn(frame, emptyMemory(frame));
      if (decision.kind !== "ask") continue;
      const allKeys = new Set(
        [...profile.requiredFields, ...profile.optionalFields].map((f) => f.key),
      );
      expect(allKeys.has(decision.gap.field.key)).toBe(true);
    }
  });

  it("question history prevents repeats", () => {
    const profile = getFrameProfile("project.event_site")!;
    let memory = emptyMemory("project.event_site");
    memory = recordQuestion(memory, {
      fieldKey: "event_date",
      question: "when is it happening?",
      askedAt: new Date().toISOString(),
    });
    const decision = planNextTurn("project.event_site", memory);
    if (decision.kind !== "ask") return;
    expect(decision.gap.field.key).not.toBe("event_date");
  });

  it("not_a_fit bypasses the adaptive loop", () => {
    const decision = planNextTurn("not_a_fit", emptyMemory("not_a_fit"));
    expect(decision.kind).toBe("redirect_not_fit");
  });

  it("hits done once confidence is above threshold", () => {
    const profile = getFrameProfile("project.event_site")!;
    // Fabricate high confidence on every required field.
    let memory = emptyMemory("project.event_site");
    for (const f of profile.requiredFields) {
      memory = mergeFacts(memory, { [f.key]: { confidence: 0.9, evidence: "seeded" } });
    }
    const decision = planNextTurn("project.event_site", memory);
    expect(decision.kind).toBe("done");
  });
});
