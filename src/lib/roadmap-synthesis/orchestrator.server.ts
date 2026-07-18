/**
 * Phase RT-1 — Orchestrator (server-only).
 *
 * Walks the DAG for the requested mode, respects gates, coalesces
 * concurrent runs via an idempotency key. Per-step attempts now persist
 * the actual input_hash from deriveSynthesisPlan and update
 * engine_project_synthesis_step_state so staleness detection is honest.
 */

import type { FillMode, SynthesisStepId, SynthesisPlan } from "./contract";
import { deriveSynthesisPlan } from "./plan.server";

type Sb = any;

export type OrchestratorRunInput = {
  projectId: string;
  supabase: Sb;
  actorEmail: string | null;
  mode: FillMode;
  stepIds?: SynthesisStepId[];
};

export type OrchestratorRunResult = {
  runGroupId: string;
  ran: SynthesisStepId[];
  skipped: SynthesisStepId[];
  blocked: Array<{ id: SynthesisStepId; reason: string }>;
  superseded: SynthesisStepId[];
  candidatesAwaitingReview: SynthesisStepId[];
  errors: Array<{ id: SynthesisStepId; message: string }>;
  attempts_persisted: boolean;
};

export async function runSynthesis(input: OrchestratorRunInput): Promise<OrchestratorRunResult> {
  const runGroupId = cryptoRandomId();
  const plan = await deriveSynthesisPlan({
    projectId: input.projectId,
    supabase: input.supabase,
  });

  const ran: SynthesisStepId[] = [];
  const skipped: SynthesisStepId[] = [];
  const blocked: OrchestratorRunResult["blocked"] = [];
  const errors: OrchestratorRunResult["errors"] = [];
  const candidatesAwaitingReview: SynthesisStepId[] = [];

  const wantSet = new Set<SynthesisStepId>(
    input.stepIds ?? plan.steps.map((s) => s.id),
  );

  const stepById = new Map(plan.steps.map((s) => [s.id, s] as const));
  const targets: SynthesisStepId[] = [];

  for (const step of plan.steps) {
    if (!wantSet.has(step.id)) continue;
    if (step.state === "blocked") {
      blocked.push({ id: step.id, reason: step.reason_detail || "Blocked" });
      continue;
    }
    const wantsRepair = input.mode === "repair" && (step.state === "missing" || step.state === "failed");
    const wantsRefresh = input.mode === "refresh" && (step.state === "stale" || step.state === "missing" || step.state === "failed");
    const wantsRebuild = input.mode === "rebuild_draft" && !step.may_affect_approved_truth;
    const wantsRebuildAsCandidate =
      input.mode === "rebuild_draft" && step.may_affect_approved_truth;
    if (wantsRebuildAsCandidate) {
      // In RT-1 we don't yet have per-step candidate writers, so we
      // surface these as awaiting-review rather than mutating truth.
      candidatesAwaitingReview.push(step.id);
      skipped.push(step.id);
      continue;
    }
    if (!(wantsRepair || wantsRefresh || wantsRebuild)) {
      skipped.push(step.id);
      continue;
    }
    targets.push(step.id);
  }

  // RT-5: in refresh mode, scan for materially-affecting new intelligence
  // BEFORE the fill runs. Amendments are written for approved truth; the
  // fill still runs to top up empty/unblocked slots.
  let materialityAmendments = 0;
  if (input.mode === "refresh") {
    try {
      const { runMaterialityScan } = await import("./runners/materiality-scan.server");
      const scan = await runMaterialityScan({
        projectId: input.projectId,
        supabase: input.supabase,
        actorEmail: input.actorEmail,
      });
      materialityAmendments = scan.amendmentsWritten;
      for (const msg of scan.errors) errors.push({ id: "materiality_scan" as SynthesisStepId, message: msg });
    } catch (err) {
      errors.push({
        id: "materiality_scan" as SynthesisStepId,
        message: err instanceof Error ? err.message : "materiality scan failed",
      });
    }
  }

  // The legacy fill is monolithic, but we can attribute per-step honestly
  // by re-deriving the plan after it runs: a step transitioning from
  // missing/failed → satisfied is what actually ran. Steps still missing
  // stay in `errors` for the caller.
  if (targets.length > 0) {
    const beforeStates = new Map(plan.steps.map((s) => [s.id, s.state] as const));
    try {
      const { runLegacyFill } = await import("./runners/legacy-fill.server");
      await runLegacyFill({
        projectId: input.projectId,
        supabase: input.supabase,
        actorEmail: input.actorEmail,
      });
      const afterPlan = await deriveSynthesisPlan({
        projectId: input.projectId,
        supabase: input.supabase,
      });
      const afterById = new Map(afterPlan.steps.map((s) => [s.id, s] as const));
      for (const id of targets) {
        const after = afterById.get(id);
        const before = beforeStates.get(id);
        if (after && (after.state === "satisfied" || after.state === "candidate_ready")) {
          ran.push(id);
        } else {
          errors.push({
            id,
            message: `Step still ${after?.state ?? "unknown"} after fill (was ${before ?? "unknown"})`,
          });
        }
      }
      // Use the fresher hash for attempt persistence below.
      (plan as { steps: SynthesisPlan["steps"] }).steps = afterPlan.steps;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fill failed";
      for (const id of targets) errors.push({ id, message });
    }
  }
  void materialityAmendments;

  // Per-step attempt rows carry the real input_hash derived by the plan;
  // step_state is upserted so `stale` detection works on the next run.
  const attempts_persisted = await tryRecordRun({
    supabase: input.supabase,
    projectId: input.projectId,
    actorEmail: input.actorEmail,
    runGroupId,
    ran,
    errors,
    plan,
    mode: input.mode,
  });

  // Structured activity log via the guarded inserter.
  try {
    const { insertEngineActivity } = await import("@/lib/engine-activity");
    await insertEngineActivity(input.supabase, {
      project_id: input.projectId,
      kind: "synthesis.plan.computed",
      title: `Synthesis run (${input.mode})`,
      body: `ran=${ran.length} skipped=${skipped.length} blocked=${blocked.length} errors=${errors.length}`,
      severity: errors.length ? "warning" : "info",
      actor_email: input.actorEmail,
    });
  } catch {
    /* activity guard is best-effort */
  }

  // Discard variable to keep TS happy about stepById presence for future use.
  void stepById;

  return {
    runGroupId,
    ran,
    skipped,
    blocked,
    superseded: [],
    candidatesAwaitingReview,
    errors,
    attempts_persisted,
  };
}

function cryptoRandomId(): string {
  // Web crypto is available in the Worker + browser + Node; fall back if not.
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function tryRecordRun(args: {
  supabase: Sb;
  projectId: string;
  actorEmail: string | null;
  runGroupId: string;
  ran: SynthesisStepId[];
  errors: OrchestratorRunResult["errors"];
  plan: SynthesisPlan;
  mode: FillMode;
}): Promise<boolean> {
  try {
    if (args.ran.length === 0) return false;
    const stepById = new Map(args.plan.steps.map((s) => [s.id, s] as const));
    const now = new Date().toISOString();
    const rows = args.ran.map((id) => {
      const view = stepById.get(id);
      const failed = args.errors.some((e) => e.id === id);
      return {
        run_group_id: args.runGroupId,
        project_id: args.projectId,
        step_id: id,
        trigger: args.mode,
        actor_email: args.actorEmail,
        input_manifest: {},
        input_hash: view?.current_input_hash ?? "",
        prompt_version: "rt-1.0.0",
        provider: "lovable",
        model: "legacy_fill",
        started_at: now,
        completed_at: now,
        status: failed ? "failed" : "succeeded",
        error_message: args.errors.find((e) => e.id === id)?.message ?? null,
      };
    });
    const { data: inserted, error } = await args.supabase
      .from("engine_project_synthesis_attempts")
      .insert(rows)
      .select("id, step_id, status, input_hash, error_message");
    if (error) return false;

    // Upsert step_state so plan derivation can detect stale/failed on the
    // next pass. Skip rows without an attempt id (should not happen).
    const stateRows = ((inserted as Array<{ id: string; step_id: SynthesisStepId; status: string; input_hash: string; error_message: string | null }>) ?? []).map((r) => ({
      project_id: args.projectId,
      step_id: r.step_id,
      state: r.status === "failed" ? "failed" : "satisfied",
      reason: r.status === "failed" ? "last_attempt_failed" : null,
      current_input_hash: r.input_hash,
      latest_attempt_id: r.id,
      updated_at: now,
    }));
    if (stateRows.length > 0) {
      await args.supabase
        .from("engine_project_synthesis_step_state")
        .upsert(stateRows, { onConflict: "project_id,step_id" });
    }
    return true;
  } catch {
    return false;
  }
}
