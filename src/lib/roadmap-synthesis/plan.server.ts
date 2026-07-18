/**
 * Phase RT-1 — Plan derivation.
 *
 * Given a project snapshot, produce the SynthesisPlan. Degrades
 * gracefully when the persistence tables from PENDING_MIGRATIONS have
 * not been applied: `attempts_available: false`, no `failed`/`stale`
 * fidelity, but `missing`/`satisfied`/`blocked` still work by
 * inspecting existing artifacts.
 */

import type {
  DoctrineGateId,
  DoctrineGateReadiness,
  StepInputManifest,
  SynthesisPlan,
  SynthesisStepId,
  SynthesisStepView,
  StepStateReason,
} from "./contract";
import { evaluateDoctrineGates } from "./gates";
import {
  SYNTHESIS_STEP_DEFINITIONS,
  topologicalOrder,
  getStepDefinition,
  isDoctrineGateId,
} from "./registry";
import { baseManifest, hashManifest } from "./manifest";
import { CAPABILITY_MENU_VERSION } from "./capability-menu";

type Sb = any;

export type DerivePlanInput = {
  projectId: string;
  supabase: Sb;
};

type ProjectSnapshot = {
  point_a: unknown;
  point_b: unknown;
  blueprint: unknown;
  gap_map: unknown;
  hidden_assets: unknown;
  sequencing: unknown;
  investment: Record<string, unknown> | null;
};

type StepStateRow = {
  step_id: SynthesisStepId;
  state: string;
  reason: string | null;
  current_input_hash: string | null;
  latest_attempt_id: string | null;
  updated_at: string;
};

type AttemptRow = {
  id: string;
  step_id: SynthesisStepId;
  started_at: string;
  completed_at: string | null;
  status: string;
  error_message: string | null;
  input_hash: string;
};

export async function deriveSynthesisPlan(input: DerivePlanInput): Promise<SynthesisPlan> {
  const [gates, snapshot, stepStateRows, attemptsAvailable, latestAttempts] = await Promise.all([
    evaluateDoctrineGates({ projectId: input.projectId, supabase: input.supabase }),
    loadProjectSnapshot(input.supabase, input.projectId),
    loadStepStateRows(input.supabase, input.projectId),
    detectAttemptsAvailable(input.supabase),
    loadLatestAttempts(input.supabase, input.projectId),
  ]);

  const gateMap = new Map<DoctrineGateId, DoctrineGateReadiness>();
  for (const g of gates) gateMap.set(g.id, g);

  const manifest = buildManifest({ snapshot, gates });
  const currentHash = hashManifest(manifest);

  const stateByStep = new Map<SynthesisStepId, StepStateRow>();
  for (const r of stepStateRows) stateByStep.set(r.step_id, r);

  const attemptsByStep = new Map<SynthesisStepId, AttemptRow>();
  for (const a of latestAttempts) attemptsByStep.set(a.step_id, a);

  const order = topologicalOrder();
  const stepsById = new Map<SynthesisStepId, SynthesisStepView>();

  for (const stepId of order) {
    const def = getStepDefinition(stepId);
    const gateBlockers = def.depends_on.filter(
      (d) => isDoctrineGateId(d) && !(gateMap.get(d as DoctrineGateId)?.satisfied ?? false),
    );
    const stepBlockers = def.depends_on.filter((d) => {
      if (!isDoctrineStepId(d)) return false;
      const upstream = stepsById.get(d as SynthesisStepId);
      return upstream && upstream.state !== "satisfied" && upstream.state !== "candidate_ready";
    });

    const persisted = stateByStep.get(stepId);
    const attempt = attemptsByStep.get(stepId);
    const artifactPresent = hasExistingArtifact(stepId, snapshot);

    let state: SynthesisStepView["state"];
    let reason: StepStateReason | null = null;
    let reasonDetail = "";

    if (gateBlockers.length > 0 || stepBlockers.length > 0) {
      state = "blocked";
      reason = gateBlockers.length > 0 ? "doctrine_gate_missing" : "dependency_running";
      const gateLabels = gateBlockers.map((g) => gateMap.get(g as DoctrineGateId)?.label ?? g);
      const stepLabels = stepBlockers.map((s) => getStepDefinition(s as SynthesisStepId).label);
      reasonDetail = [...gateLabels, ...stepLabels].join(", ");
    } else if (persisted) {
      state = mapPersistedState(persisted.state);
      reason = (persisted.reason as StepStateReason | null) ?? null;
      reasonDetail = attempt?.error_message ?? "";
      if (persisted.current_input_hash && persisted.current_input_hash !== currentHash) {
        state = "stale";
        reason = "input_changed";
        reasonDetail = "Inputs changed since the last run";
      }
    } else if (attempt && attempt.status === "failed") {
      state = "failed";
      reason = "last_attempt_failed";
      reasonDetail = attempt.error_message ?? "Previous attempt failed";
    } else if (artifactPresent) {
      state = "satisfied";
    } else {
      state = "missing";
      reason = "artifact_missing";
    }

    stepsById.set(stepId, {
      id: stepId,
      label: def.label,
      state,
      reason,
      reason_detail: reasonDetail,
      blocked_by: [...gateBlockers, ...stepBlockers] as SynthesisStepView["blocked_by"],
      last_attempt_at: attempt?.completed_at ?? attempt?.started_at ?? null,
      last_error: attempt?.error_message ?? null,
      last_input_hash: persisted?.current_input_hash ?? attempt?.input_hash ?? null,
      current_input_hash: currentHash,
      requires_human_review: def.requires_human_review,
      may_affect_approved_truth: def.may_affect_approved_truth,
    });
  }

  const gated = gates.some((g) => !g.satisfied);
  const steps = SYNTHESIS_STEP_DEFINITIONS.map((d) => stepsById.get(d.id)!);
  const runnable_repair = steps
    .filter((s) => s.state === "missing" || s.state === "failed")
    .map((s) => s.id);

  return { gates, steps, attempts_available: attemptsAvailable, gated, runnable_repair };
}

function isDoctrineStepId(id: DoctrineGateId | SynthesisStepId): boolean {
  return !isDoctrineGateId(id);
}

function mapPersistedState(raw: string): SynthesisStepView["state"] {
  switch (raw) {
    case "satisfied":
    case "missing":
    case "failed":
    case "stale":
    case "blocked":
    case "running":
    case "candidate_ready":
    case "awaiting_review":
    case "superseded":
      return raw as SynthesisStepView["state"];
    default:
      return "missing";
  }
}

async function loadProjectSnapshot(sb: Sb, projectId: string): Promise<ProjectSnapshot> {
  const { data } = await sb
    .from("engine_projects")
    .select("point_a, point_b, blueprint, gap_map, hidden_assets, sequencing, investment")
    .eq("id", projectId)
    .single();
  return (data ?? {
    point_a: null,
    point_b: null,
    blueprint: null,
    gap_map: null,
    hidden_assets: null,
    sequencing: null,
    investment: null,
  }) as ProjectSnapshot;
}

async function loadStepStateRows(sb: Sb, projectId: string): Promise<StepStateRow[]> {
  try {
    const { data, error } = await sb
      .from("engine_project_synthesis_step_state")
      .select("step_id, state, reason, current_input_hash, latest_attempt_id, updated_at")
      .eq("project_id", projectId);
    if (error) return [];
    return (data ?? []) as StepStateRow[];
  } catch {
    return [];
  }
}

async function loadLatestAttempts(sb: Sb, projectId: string): Promise<AttemptRow[]> {
  try {
    const { data, error } = await sb
      .from("engine_project_synthesis_attempts")
      .select("id, step_id, started_at, completed_at, status, error_message, input_hash")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) return [];
    const seen = new Set<SynthesisStepId>();
    const out: AttemptRow[] = [];
    for (const row of (data ?? []) as AttemptRow[]) {
      if (seen.has(row.step_id)) continue;
      seen.add(row.step_id);
      out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}

async function detectAttemptsAvailable(sb: Sb): Promise<boolean> {
  try {
    const { error } = await sb
      .from("engine_project_synthesis_attempts")
      .select("id", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
}

function hasExistingArtifact(step: SynthesisStepId, s: ProjectSnapshot): boolean {
  switch (step) {
    case "point_a":
      return !isBlank(s.point_a);
    case "point_b":
      return !isBlank(s.point_b);
    case "truth_blueprint":
      return !isBlank(s.blueprint);
    case "truth_gaps":
    case "truth_constraints":
      return !isBlank(s.gap_map);
    case "truth_assets":
      return !isBlank(s.hidden_assets);
    case "truth_sequencing":
      return !isBlank(s.sequencing);
    case "investment_note": {
      const inv = (s.investment ?? {}) as Record<string, unknown>;
      const phases = Array.isArray((inv as { phases?: unknown }).phases)
        ? ((inv as { phases: unknown[] }).phases as unknown[])
        : [];
      return (
        phases.length > 0 ||
        Boolean((inv as { deferred_reason?: unknown }).deferred_reason) ||
        (inv as { range_low_usd?: unknown }).range_low_usd != null
      );
    }
    // milestones / dates / rationale can't be reliably derived without extra
    // queries; treat as missing so plan surfaces them for repair. The
    // orchestrator's real runner will no-op when it finds them present.
    case "milestones":
    case "milestone_dates":
    case "phase_rationale":
      return false;
  }
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function buildManifest(args: {
  snapshot: ProjectSnapshot;
  gates: DoctrineGateReadiness[];
}): StepInputManifest {
  const gate = (id: DoctrineGateId) => args.gates.find((g) => g.id === id);
  return baseManifest({
    world_entry_version: gate("world_entry")?.satisfied ? 1 : null,
    execution_boundary_version: gate("execution_boundary")?.satisfied ? 1 : null,
    strategic_thesis_version: gate("strategic_thesis")?.satisfied ? 1 : null,
    capability_menu_version: CAPABILITY_MENU_VERSION,
  });
}
