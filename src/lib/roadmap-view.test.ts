import { describe, it, expect } from "vitest";
import { deriveRoadmapView, diffVersions } from "./roadmap-view";
import type { SpineMilestone } from "@/lib/engine.functions";

const baseReadiness: SpineMilestone["readiness"] = {
  criteria: "done",
  design: "not_configured",
  mockups: "not_configured",
  build: "done",
  evidence: "done",
  qa_auto: "done",
  qa_human: "done",
  due_date: "done",
  dependencies: "not_configured",
  blockers: "done",
  counts: { frames: 0, mockups: 0, packets: 0, evidence: 0, qa_plans: 0, qa_reviews: 0 },
};

function ms(overrides: Partial<SpineMilestone> & { dependencies?: string[] } = {}): SpineMilestone {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "Milestone",
    phase: overrides.phase ?? "Build",
    status: overrides.status ?? "in_progress",
    approval_status: overrides.approval_status ?? "pending",
    sort_index: overrides.sort_index ?? 0,
    due_date: overrides.due_date ?? "2026-08-01",
    brief_md: overrides.brief_md ?? null,
    readiness: overrides.readiness ?? baseReadiness,
    ...(overrides.dependencies ? { dependencies: overrides.dependencies } : {}),
  } as SpineMilestone;
}

const empty = {
  point_a_approved: true,
  point_b_approved: true,
  point_a_summary: { title: "A", description: null },
  point_b_summary: { title: "B", description: null },
  version: null,
  milestones: [] as SpineMilestone[],
  activity: [],
  reviews: [],
  family: [],
};

describe("deriveRoadmapView", () => {
  it("returns no_truth when Point A not approved and no legacy content", () => {
    const v = deriveRoadmapView({ ...empty, point_a_approved: false });
    expect(v.mode).toBe("no_truth");
    expect(v.missing_for_approval).toContain("Approve Point A");
  });

  it("returns draft_generating when truths approved but no version and no milestones", () => {
    const v = deriveRoadmapView(empty);
    expect(v.mode).toBe("draft_generating");
  });

  it("groups milestones by phase and computes phase status", () => {
    const v = deriveRoadmapView({
      ...empty,
      milestones: [
        ms({ id: "1", phase: "Stabilize", status: "complete" }),
        ms({ id: "2", phase: "Build", status: "in_progress" }),
        ms({ id: "3", phase: "Build", status: "blocked" }),
      ],
    });
    expect(v.phases.map((p) => p.name).sort()).toEqual(["Build", "Stabilize"]);
    const build = v.phases.find((p) => p.name === "Build")!;
    expect(build.blocked_count).toBe(1);
    expect(build.status).toBe("blocked");
  });

  it("marks milestones on the critical path", () => {
    const v = deriveRoadmapView({
      ...empty,
      milestones: [
        ms({ id: "a", name: "A", phase: "P1", status: "in_progress", brief_md: null }),
        ms({
          id: "b",
          name: "B",
          phase: "P1",
          status: "blocked",
          brief_md: null,
          // dependencies field is read via bracket access in view
          ...({ dependencies: ["a"] } as Partial<SpineMilestone>),
        }),
      ],
    });
    expect(v.critical_path.bottleneck_name).toBe("B");
    const b = v.milestones.find((m) => m.id === "b");
    expect(b?.on_critical_path).toBe(true);
  });

  it("computes summary counts and health label", () => {
    const v = deriveRoadmapView({
      ...empty,
      milestones: [
        ms({ id: "1", status: "in_progress" }),
        ms({ id: "2", status: "blocked" }),
        ms({ id: "3", status: "complete" }),
      ],
    });
    expect(v.summary.active_milestones).toBe(1);
    expect(v.summary.blocked_milestones).toBe(1);
    expect(v.totals.completed).toBe(1);
    expect(["at_risk", "needs_attention"]).toContain(v.health.label);
  });

  it("produces a change summary from a prior payload", () => {
    const diff = diffVersions(
      { milestones: [{ id: "1", name: "One", due_date: "2026-09-01" }] },
      { milestones: [{ id: "1", name: "One", due_date: "2026-08-01" }, { id: "2", name: "Two" }] },
      [],
    );
    expect(diff.changed).toContain("One");
    expect(diff.removed).toContain("Two");
  });
});
