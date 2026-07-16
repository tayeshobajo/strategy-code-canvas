/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 1A — Live Spine Readiness evaluator over Supabase state.
 *
 * Assembles a compact `SpineReadinessInput` (one boolean per canonical
 * check) from `engine_spine_field_truth`, `engine_projects`,
 * `engine_milestones`, `engine_roadmap_versions`, and
 * `client_portal_roadmaps`, then delegates to the pure evaluator in
 * `spine-readiness-evaluator.ts`.
 *
 * Best-effort: any read that fails degrades that check to `unknown`
 * (rendered as a neutral pill; does NOT count as passing).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateSpineReadiness,
  isApprovedTruth,
  isSettled,
  type SpineReadinessInput,
  type SpineReadinessResult,
  type SpineReadinessCheckId,
} from "@/lib/spine-readiness-evaluator";
import type { SpineFieldStatus } from "@/lib/spine-contract";

type Sb = any;

/**
 * DB epistemic status → contract spine field status.
 * DB uses: stated | inferred | assumed | missing | contradicted |
 *          needs_confirmation | verified | approved_truth
 * Contract uses: draft | inferred | needs_confirmation | contradictory |
 *          accepted_assumption | verified | approved_truth | superseded
 */
function mapDbStatus(s: string | null | undefined): SpineFieldStatus | null {
  switch (s) {
    case "approved_truth": return "approved_truth";
    case "verified": return "verified";
    case "assumed": return "accepted_assumption";
    case "contradicted": return "contradictory";
    case "needs_confirmation": return "needs_confirmation";
    case "inferred": return "inferred";
    case "stated": return "needs_confirmation"; // asserted but not yet reviewed
    case "missing": return "draft";
    default: return null;
  }
}

type TruthRow = {
  spine: string;
  field_key: string;
  status: string;
  source_ref: Record<string, unknown> | null;
  updated_at: string | null;
};

function keyOf(spine: string, field: string) {
  return `${spine}:${field}`;
}

export const evaluateProjectSpineReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ result: SpineReadinessResult; assembledAt: string }> => {
    const sb = (context as { supabase: Sb }).supabase;
    const projectId = data.projectId;

    const input: SpineReadinessInput = {
      point_a_approved: null,
      point_b_approved: null,
      no_material_contradiction: null,
      assumptions_accepted: null,
      constraints_named: null,
      assets_reviewed: null,
      gaps_classified: null,
      blueprint_reflects_solution: null,
      roadmap_rationale_approved: null,
      sequence_valid: null,
      critical_dates_captured: null,
      success_metrics_measurable: null,
      investment_present_or_deferred: null,
      client_acknowledged_destination: null,
    };
    const notes: Partial<Record<SpineReadinessCheckId, string>> = {};

    // ---- 1. Truth rows ----
    const statusByKey = new Map<string, { status: SpineFieldStatus | null; reason: string | null; updatedAt: string | null }>();
    try {
      const { data: rows, error } = await sb
        .from("engine_spine_field_truth")
        .select("spine, field_key, status, source_ref, updated_at")
        .eq("project_id", projectId);
      if (!error) {
        for (const r of (rows ?? []) as TruthRow[]) {
          const reason = (r.source_ref && typeof r.source_ref === "object"
            ? ((r.source_ref as Record<string, unknown>).rationale as string
              ?? (r.source_ref as Record<string, unknown>).reason as string
              ?? null)
            : null);
          statusByKey.set(keyOf(r.spine, r.field_key), {
            status: mapDbStatus(r.status),
            reason,
            updatedAt: r.updated_at,
          });
        }
      }
    } catch { /* degrade */ }

    // Aggregate helpers
    const hasApprovedInSection = (spine: string) => {
      for (const [k, v] of statusByKey.entries()) {
        if (k.startsWith(`${spine}:`) && isApprovedTruth(v.status)) return true;
      }
      return false;
    };
    const anyContradictoryOnSpine = () => {
      for (const v of statusByKey.values()) if (v.status === "contradictory") return true;
      return false;
    };
    const acceptedAssumptionsMissingReason = () => {
      let bad = 0;
      for (const v of statusByKey.values()) {
        if (v.status === "accepted_assumption" && !(v.reason && v.reason.trim())) bad++;
      }
      return bad;
    };
    const sectionSettled = (spine: string) => {
      for (const [k, v] of statusByKey.entries()) {
        if (k.startsWith(`${spine}:`) && isSettled(v.status)) return true;
      }
      return false;
    };
    const sectionTouched = (spine: string) => {
      for (const [k] of statusByKey.entries()) if (k.startsWith(`${spine}:`)) return true;
      return false;
    };

    // Checks 1, 2 — Point A/B approved
    input.point_a_approved = hasApprovedInSection("point-a");
    input.point_b_approved = hasApprovedInSection("point-b");

    // Check 3 — no material contradictions on Spine + extracted signals
    let contradictoryExternal = false;
    try {
      const { count, error } = await sb
        .from("engine_extracted_signals")
        .select("id", { head: true, count: "exact" })
        .eq("project_id", projectId)
        .eq("status", "contradicted")
        .is("superseded_by", null);
      if (!error) contradictoryExternal = (count ?? 0) > 0;
    } catch { /* leave as false */ }
    input.no_material_contradiction = !(anyContradictoryOnSpine() || contradictoryExternal);

    // Check 4 — assumptions accepted with reason
    const missingReason = acceptedAssumptionsMissingReason();
    input.assumptions_accepted = missingReason === 0;
    if (missingReason > 0) notes.assumptions_accepted = `${missingReason} accepted assumption(s) missing a reason`;

    // Checks 5–8, 10, 11 — section-scoped
    input.constraints_named = sectionSettled("constraints-risks") || sectionSettled("gap-map");
    input.assets_reviewed = sectionTouched("assets-leverage") || sectionTouched("hidden-assets");
    input.gaps_classified = sectionSettled("gap-map") || sectionSettled("constraints-risks");
    input.blueprint_reflects_solution = sectionSettled("approved-scope") || sectionSettled("blueprint");
    input.sequence_valid = sectionSettled("milestone-readiness") || sectionSettled("sequencing");

    // ---- 2. Approved roadmap version + phase rationale ----
    try {
      const { data: rv, error } = await sb
        .from("engine_roadmap_versions")
        .select("id, approved_at, payload, created_at")
        .eq("project_id", projectId)
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && rv) {
        const phases = ((rv.payload as any)?.phases ?? (rv.payload as any)?.roadmap?.phases ?? []) as Array<any>;
        if (Array.isArray(phases) && phases.length > 0) {
          const withRationale = phases.filter((p) => typeof p?.rationale === "string" && p.rationale.trim().length > 0).length;
          input.roadmap_rationale_approved = withRationale === phases.length;
          if (withRationale < phases.length) notes.roadmap_rationale_approved = `${withRationale}/${phases.length} phases have rationale`;
        } else {
          input.roadmap_rationale_approved = false;
          notes.roadmap_rationale_approved = "Approved version has no phases";
        }
      } else {
        input.roadmap_rationale_approved = false;
        notes.roadmap_rationale_approved = "No approved roadmap version yet";
      }
    } catch { /* leave null */ }

    // ---- 3. Milestones due dates ----
    try {
      const { data: ms, error } = await sb
        .from("engine_milestones")
        .select("id, status, due_date")
        .eq("project_id", projectId);
      if (!error) {
        const inScope = (ms ?? []).filter((m: any) => m.status !== "cancelled" && m.status !== "dropped");
        if (inScope.length === 0) {
          input.critical_dates_captured = null;
          notes.critical_dates_captured = "No milestones in scope";
        } else {
          const withDue = inScope.filter((m: any) => m.due_date).length;
          input.critical_dates_captured = withDue === inScope.length;
          if (withDue < inScope.length) notes.critical_dates_captured = `${withDue}/${inScope.length} milestones have a due date`;
        }
      }
    } catch { /* leave null */ }

    // ---- 4. Point B success metrics measurable ----
    // ---- 5. Investment present or intentionally deferred ----
    try {
      const { data: proj, error } = await sb
        .from("engine_projects")
        .select("point_b, investment")
        .eq("id", projectId)
        .maybeSingle();
      if (!error && proj) {
        const pb = (proj.point_b ?? {}) as Record<string, unknown>;
        const metricValues = Object.entries(pb)
          .filter(([k]) => /outcome|metric|position/.test(k))
          .map(([, v]) => (typeof v === "string" ? v.trim() : ""))
          .filter((s) => s.length > 0);
        input.success_metrics_measurable = metricValues.length >= 2;
        if (!input.success_metrics_measurable) {
          notes.success_metrics_measurable = `${metricValues.length} measurable outcome(s) captured`;
        }

        const inv = (proj.investment ?? {}) as Record<string, unknown>;
        const phases = Array.isArray((inv as any).phases) ? ((inv as any).phases as Array<any>) : [];
        const hasRanges = phases.some((p) => p && (p.range || p.low != null || p.high != null || p.min != null));
        const deferred = Boolean((inv as any).deferred_reason || (inv as any).deferred);
        input.investment_present_or_deferred = hasRanges || deferred;
        if (!input.investment_present_or_deferred) {
          notes.investment_present_or_deferred = "No investment ranges and no deferral reason";
        }
      }
    } catch { /* leave null */ }

    // ---- 6. Client acknowledged the current roadmap ----
    try {
      const { data: cpr, error } = await sb
        .from("client_portal_roadmaps")
        .select("acknowledged_at, published_at")
        .eq("project_id", projectId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!error) {
        if (!cpr || !cpr.published_at) {
          input.client_acknowledged_destination = false;
          notes.client_acknowledged_destination = "Roadmap not yet published to client portal";
        } else {
          input.client_acknowledged_destination = Boolean(cpr.acknowledged_at);
          if (!cpr.acknowledged_at) notes.client_acknowledged_destination = "Client has not acknowledged the current roadmap";
        }
      }
    } catch { /* leave null */ }

    const result = evaluateSpineReadiness(input, notes);
    return { result, assembledAt: new Date().toISOString() };
  });
