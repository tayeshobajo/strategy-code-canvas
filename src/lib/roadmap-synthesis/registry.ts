/**
 * Phase RT-1 — Canonical step registry + dependency DAG.
 *
 * Single source of truth for step order, dependencies, whether a step may
 * touch approved truth, and its runner id. Validated by unit tests to
 * have no cycles and to only reference known ids.
 */

import type { DoctrineGateId, StepDefinition, SynthesisStepId } from "./contract";

export const DOCTRINE_GATE_IDS: readonly DoctrineGateId[] = [
  "world_entry",
  "execution_boundary",
  "strategic_thesis",
  "drift_assessment",
] as const;

export const SYNTHESIS_STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    id: "point_a",
    label: "Point A — Current Reality",
    depends_on: ["world_entry"],
    output_type: "point_a_draft",
    requires_human_review: true,
    may_affect_approved_truth: true,
    runner: "runners/point-a",
  },
  {
    id: "point_b",
    label: "Point B — Desired Future",
    depends_on: ["world_entry", "point_a"],
    output_type: "point_b_draft",
    requires_human_review: true,
    may_affect_approved_truth: true,
    runner: "runners/point-b",
  },
  {
    id: "truth_blueprint",
    label: "Blueprint truth row",
    depends_on: ["execution_boundary", "point_b"],
    output_type: "truth_row",
    requires_human_review: true,
    may_affect_approved_truth: false,
    runner: "runners/truth-blueprint",
  },
  {
    id: "truth_gaps",
    label: "Gap map truth row",
    depends_on: ["point_a"],
    output_type: "truth_row",
    requires_human_review: true,
    may_affect_approved_truth: false,
    runner: "runners/truth-gaps",
  },
  {
    id: "truth_assets",
    label: "Hidden assets truth row",
    depends_on: ["point_a"],
    output_type: "truth_row",
    requires_human_review: true,
    may_affect_approved_truth: false,
    runner: "runners/truth-assets",
  },
  {
    id: "truth_constraints",
    label: "Constraints & risks truth row",
    depends_on: ["execution_boundary"],
    output_type: "truth_row",
    requires_human_review: true,
    may_affect_approved_truth: false,
    runner: "runners/truth-constraints",
  },
  {
    id: "milestones",
    label: "Milestone candidate set",
    depends_on: [
      "world_entry",
      "execution_boundary",
      "strategic_thesis",
      "point_a",
      "point_b",
      "truth_blueprint",
    ],
    output_type: "milestone_candidate_set",
    requires_human_review: true,
    may_affect_approved_truth: true,
    runner: "runners/milestones",
  },
  {
    id: "milestone_dates",
    label: "Milestone due dates",
    depends_on: ["milestones"],
    output_type: "milestone_date_map",
    requires_human_review: false,
    may_affect_approved_truth: false,
    runner: "runners/milestone-dates",
  },
  {
    id: "phase_rationale",
    label: "Phase rationale (roadmap version)",
    depends_on: ["milestones", "strategic_thesis"],
    output_type: "phase_rationale_patch",
    requires_human_review: true,
    may_affect_approved_truth: true,
    runner: "runners/phase-rationale",
  },
  {
    id: "truth_sequencing",
    label: "Sequencing truth row",
    depends_on: ["milestones"],
    output_type: "truth_row",
    requires_human_review: true,
    may_affect_approved_truth: false,
    runner: "runners/truth-sequencing",
  },
  {
    id: "investment_note",
    label: "Investment deferral note",
    depends_on: ["execution_boundary"],
    output_type: "investment_patch",
    requires_human_review: false,
    may_affect_approved_truth: false,
    runner: "runners/investment-note",
  },
] as const;

export const SYNTHESIS_STEP_IDS: readonly SynthesisStepId[] = SYNTHESIS_STEP_DEFINITIONS.map(
  (s) => s.id,
);

export function getStepDefinition(id: SynthesisStepId): StepDefinition {
  const found = SYNTHESIS_STEP_DEFINITIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown synthesis step: ${id}`);
  return found;
}

const SYNTHESIS_ID_SET: ReadonlySet<SynthesisStepId> = new Set(SYNTHESIS_STEP_IDS);
const GATE_ID_SET: ReadonlySet<DoctrineGateId> = new Set(DOCTRINE_GATE_IDS);

export function isSynthesisStepId(id: string): id is SynthesisStepId {
  return SYNTHESIS_ID_SET.has(id as SynthesisStepId);
}

export function isDoctrineGateId(id: string): id is DoctrineGateId {
  return GATE_ID_SET.has(id as DoctrineGateId);
}

export type DagValidationResult =
  | { ok: true }
  | { ok: false; reason: "unknown_dependency" | "cycle"; detail: string };

/** Kahn-style topological validation. Cycles or unknown ids fail closed. */
export function validateDag(
  defs: readonly StepDefinition[] = SYNTHESIS_STEP_DEFINITIONS,
): DagValidationResult {
  const indegree = new Map<SynthesisStepId, number>();
  const outgoing = new Map<SynthesisStepId, SynthesisStepId[]>();
  for (const d of defs) {
    indegree.set(d.id, 0);
    outgoing.set(d.id, []);
  }
  for (const d of defs) {
    for (const dep of d.depends_on) {
      if (isDoctrineGateId(dep)) continue; // gates aren't in the synthesis DAG
      if (!indegree.has(dep as SynthesisStepId)) {
        return {
          ok: false,
          reason: "unknown_dependency",
          detail: `${d.id} depends on unknown ${dep}`,
        };
      }
      indegree.set(d.id, (indegree.get(d.id) ?? 0) + 1);
      outgoing.get(dep as SynthesisStepId)!.push(d.id);
    }
  }
  const queue: SynthesisStepId[] = [];
  for (const [id, n] of indegree) if (n === 0) queue.push(id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const next of outgoing.get(id) ?? []) {
      const n = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  if (visited !== defs.length) {
    return { ok: false, reason: "cycle", detail: `visited ${visited} of ${defs.length} steps` };
  }
  return { ok: true };
}

/** Topological order over synthesis steps only (gates are prerequisites, not nodes). */
export function topologicalOrder(
  defs: readonly StepDefinition[] = SYNTHESIS_STEP_DEFINITIONS,
): SynthesisStepId[] {
  const indegree = new Map<SynthesisStepId, number>();
  const outgoing = new Map<SynthesisStepId, SynthesisStepId[]>();
  for (const d of defs) {
    indegree.set(d.id, 0);
    outgoing.set(d.id, []);
  }
  for (const d of defs) {
    for (const dep of d.depends_on) {
      if (!isSynthesisStepId(dep)) continue;
      indegree.set(d.id, (indegree.get(d.id) ?? 0) + 1);
      outgoing.get(dep as SynthesisStepId)!.push(d.id);
    }
  }
  const order: SynthesisStepId[] = [];
  const queue: SynthesisStepId[] = [];
  for (const [id, n] of indegree) if (n === 0) queue.push(id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const n = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  return order;
}
