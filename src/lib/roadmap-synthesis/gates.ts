/**
 * Phase RT-1 — Doctrine gate evaluators.
 *
 * Read-only. Do NOT build the resolution editors in RT-1. When a gate is
 * unsatisfied, expose `resolution_deep_link` to the existing best-fit
 * editor and `resolution_pending: true` so the UI can badge it as
 * "RT-2/RT-3 workspace coming".
 */

import type { DoctrineGateId, DoctrineGateReadiness } from "./contract";

type Sb = any;

/**
 * Truth rows for doctrine gates piggyback on `engine_spine_field_truth`
 * using new spine keys. RT-2/RT-3 own the write path; RT-1 only reads.
 */
const GATE_SPINES: Record<DoctrineGateId, string> = {
  world_entry: "world-entry",
  execution_boundary: "execution-boundary",
  strategic_thesis: "strategic-thesis",
  drift_assessment: "drift-assessment",
};

const GATE_LABELS: Record<DoctrineGateId, string> = {
  world_entry: "World Entry",
  execution_boundary: "Execution Boundary",
  strategic_thesis: "Strategic Thesis",
  drift_assessment: "Drift Assessment",
};

export type GateEvaluationInput = {
  projectId: string;
  supabase: Sb;
};

type TruthRow = { spine: string; field_key: string; status: string; source_ref: unknown };

export async function evaluateDoctrineGates(
  input: GateEvaluationInput,
): Promise<DoctrineGateReadiness[]> {
  const { data: rows } = await input.supabase
    .from("engine_spine_field_truth")
    .select("spine, field_key, status, source_ref")
    .eq("project_id", input.projectId)
    .in("spine", Object.values(GATE_SPINES));

  const byGate = new Map<DoctrineGateId, TruthRow[]>();
  for (const gate of Object.keys(GATE_SPINES) as DoctrineGateId[]) byGate.set(gate, []);
  for (const r of (rows ?? []) as TruthRow[]) {
    const gateEntry = (Object.entries(GATE_SPINES) as Array<[DoctrineGateId, string]>).find(
      ([, spine]) => spine === r.spine,
    );
    if (gateEntry) byGate.get(gateEntry[0])!.push(r);
  }

  // RT-2 sidecar: read World Entry workspace from spirit_first_analysis
  // until the spine_check constraint is relaxed to accept 'world-entry'.
  const { data: projRow } = await input.supabase
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", input.projectId)
    .maybeSingle();
  const spirit = ((projRow?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  const worldEntrySidecar = spirit["world_entry_workspace"] as
    | {
        current?: {
          status?: string;
          destination_summary?: string;
          competitors?: unknown[];
          vocabulary?: unknown[];
        } | null;
      }
    | undefined;

  return (Object.keys(GATE_SPINES) as DoctrineGateId[]).map((id) => {
    if (id === "world_entry") {
      return worldEntrySidecarGate(worldEntrySidecar, byGate.get(id) ?? []);
    }
    const gateRows = byGate.get(id) ?? [];
    return evaluateGate(id, gateRows);
  });
}

function worldEntrySidecarGate(
  sidecar:
    | {
        current?: {
          status?: string;
          destination_summary?: string;
          competitors?: unknown[];
          vocabulary?: unknown[];
        } | null;
      }
    | undefined,
  fallbackRows: TruthRow[],
): DoctrineGateReadiness {
  const b = base("world_entry");
  const current = sidecar?.current;
  if (current) {
    const missing: string[] = [];
    const isApproved = current.status === "approved";
    const summary = (current.destination_summary ?? "").trim();
    const competitors = Array.isArray(current.competitors) ? current.competitors : [];
    const vocabulary = Array.isArray(current.vocabulary) ? current.vocabulary : [];
    if (!summary || summary.length < 20) missing.push("Industry destination summary");
    if (competitors.length < 3) missing.push(`Competitor review (${competitors.length}/3)`);
    if (vocabulary.length < 5) missing.push(`Category vocabulary (${vocabulary.length}/5 tokens)`);
    if (!isApproved) missing.push("Awaiting human approval");
    return { ...b, satisfied: missing.length === 0, missing_pieces: missing, resolution_pending: false };
  }
  // Fall back to legacy engine_spine_field_truth read.
  return { ...worldEntryGate(fallbackRows), resolution_pending: false };
}

function evaluateGate(id: DoctrineGateId, rows: TruthRow[]): DoctrineGateReadiness {
  switch (id) {
    case "world_entry":
      return worldEntryGate(rows);
    case "execution_boundary":
      return executionBoundaryGate(rows);
    case "strategic_thesis":
      return strategicThesisGate(rows);
    case "drift_assessment":
      return driftAssessmentGate(rows);
  }
}

function base(id: DoctrineGateId): Omit<DoctrineGateReadiness, "satisfied" | "missing_pieces"> {
  return {
    id,
    label: GATE_LABELS[id],
    resolution_deep_link: RESOLUTION_LINKS[id],
    resolution_pending: true,
    version: null,
  };
}

/**
 * Temporary deep links. RT-2/RT-3 build the real workspaces. Documented
 * in .orchestrator/BUILD_STATE.md as an intentional bridge.
 */
const RESOLUTION_LINKS: Record<DoctrineGateId, string> = {
  world_entry: "understanding-room",
  execution_boundary: "builder",
  strategic_thesis: "point-b",
  drift_assessment: "roadmap",
};

function worldEntryGate(rows: TruthRow[]): DoctrineGateReadiness {
  const b = base("world_entry");
  const summaryRow = rows.find((r) => r.field_key === "destination_summary");
  const competitorsRow = rows.find((r) => r.field_key === "competitors");
  const vocabularyRow = rows.find((r) => r.field_key === "vocabulary");

  const competitors = extractArray(competitorsRow?.source_ref, "items");
  const vocabulary = extractArray(vocabularyRow?.source_ref, "tokens");
  const missing: string[] = [];
  if (!summaryRow || !isSettled(summaryRow.status)) missing.push("Industry destination summary");
  if (competitors.length < 3) missing.push(`Competitor review (${competitors.length}/3)`);
  if (vocabulary.length < 5) missing.push(`Category vocabulary (${vocabulary.length}/5 tokens)`);

  return { ...b, satisfied: missing.length === 0, missing_pieces: missing };
}

function executionBoundaryGate(rows: TruthRow[]): DoctrineGateReadiness {
  const b = base("execution_boundary");
  const caps = extractArray(rows.find((r) => r.field_key === "approved_capabilities")?.source_ref, "items");
  const clientOwned = extractArray(rows.find((r) => r.field_key === "client_owned_areas")?.source_ref, "items");
  const missing: string[] = [];
  if (caps.length < 1) missing.push("At least one approved Trust Tai capability");
  if (clientOwned.length < 1) missing.push("Explicit client-owned areas");
  return { ...b, satisfied: missing.length === 0, missing_pieces: missing };
}

function strategicThesisGate(rows: TruthRow[]): DoctrineGateReadiness {
  const b = base("strategic_thesis");
  const thesis = rows.find((r) => r.field_key === "thesis");
  const missing: string[] = [];
  if (!thesis || !isSettled(thesis.status)) missing.push("Approved strategic thesis statement");
  return { ...b, satisfied: missing.length === 0, missing_pieces: missing };
}

function driftAssessmentGate(rows: TruthRow[]): DoctrineGateReadiness {
  const b = base("drift_assessment");
  const overallRow = rows.find((r) => r.field_key === "overall");
  const overall = extractString(overallRow?.source_ref, "status");
  const satisfied = overall === "pass";
  return {
    ...b,
    satisfied,
    missing_pieces: satisfied
      ? []
      : ["Latest milestone candidate set has not passed the Drift Test"],
  };
}

function extractArray(source: unknown, key: string): unknown[] {
  if (!source || typeof source !== "object") return [];
  const val = (source as Record<string, unknown>)[key];
  return Array.isArray(val) ? val : [];
}

function extractString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const val = (source as Record<string, unknown>)[key];
  return typeof val === "string" ? val : null;
}

function isSettled(status: string): boolean {
  return (
    status === "verified" ||
    status === "approved_truth" ||
    status === "accepted_assumption" ||
    status === "stated"
  );
}
