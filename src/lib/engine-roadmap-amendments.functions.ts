/**
 * Phase RT-5 — Controlled roadmap amendments.
 *
 * When new intelligence would touch an already-approved truth row, the
 * orchestrator writes a candidate to `engine_project_synthesis_candidates`
 * with `step_id='roadmap_amendment'`. Reviewers approve/reject via the
 * amendments inbox; approval bumps the target truth version and marks
 * downstream synthesis steps stale. Second-reviewer rule applies —
 * the reviewer email cannot match the actor recorded in the payload.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

type Sb = { from: (t: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any };
type Row = Record<string, unknown>;

export type RoadmapAmendment = {
  id: string;
  projectId: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  materiality: string | null;
  createdAt: string;
  createdByEmail: string | null;
  reviewedAt: string | null;
  reviewerEmail: string | null;
  decision: string | null;
  decisionReason: string | null;
  payload: AmendmentPayload;
};

export type AmendmentPayload = {
  kind: "roadmap_amendment";
  target: {
    kind: "truth";
    truthId: string;
    spine: string;
    fieldKey: string;
  };
  before: unknown;
  after: unknown;
  rationale: string;
  impact: string;
  confidence: number;
  sourceIds: string[];
  signalIds: string[];
  actorEmail: string | null;
  createdAt: string;
};

const listInput = z.object({
  projectId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "superseded", "all"]).default("pending"),
});

export const listRoadmapAmendments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw))
  .handler(async ({ context, data }): Promise<RoadmapAmendment[]> => {
    const sb = (context as { supabase: Sb }).supabase;
    const email = (context as { claims?: { email?: string } }).claims?.email;
    const isAdmin = await hasRoleForEmail(sb as never, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    let q = sb
      .from("engine_project_synthesis_candidates")
      .select("id, project_id, status, materiality, created_at, reviewed_at, reviewer_email, decision, decision_reason, payload")
      .eq("project_id", data.projectId)
      .eq("step_id", "roadmap_amendment")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message ?? "Failed to load amendments");
    return ((rows as Row[]) ?? []).map(rowToAmendment);
  });

const proposeInput = z.object({
  projectId: z.string().uuid(),
  truthId: z.string().uuid(),
  after: z.unknown(),
  rationale: z.string().min(1).max(4_000),
  impact: z.string().max(64),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceIds: z.array(z.string().uuid()).default([]),
  signalIds: z.array(z.string().uuid()).default([]),
});

export const proposeRoadmapAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => proposeInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ amendmentId: string }> => {
    const sb = (context as { supabase: Sb }).supabase;
    const email = (context as { claims?: { email?: string } }).claims?.email ?? null;
    const isAdmin = await hasRoleForEmail(sb as never, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const truthRes = await sb
      .from("engine_spine_field_truth")
      .select("id, project_id, spine, field_key, status, source_ref")
      .eq("id", data.truthId)
      .maybeSingle();
    const truth = truthRes.data as Row | null;
    if (!truth) throw new Error("Truth row not found");
    if ((truth.project_id as string) !== data.projectId) throw new Error("Project/truth mismatch");

    const payload: AmendmentPayload = {
      kind: "roadmap_amendment",
      target: {
        kind: "truth",
        truthId: data.truthId,
        spine: truth.spine as string,
        fieldKey: truth.field_key as string,
      },
      before: (truth.source_ref as unknown) ?? null,
      after: data.after,
      rationale: data.rationale,
      impact: data.impact,
      confidence: data.confidence,
      sourceIds: data.sourceIds,
      signalIds: data.signalIds,
      actorEmail: email,
      createdAt: new Date().toISOString(),
    };

    const { data: inserted, error } = await sb
      .from("engine_project_synthesis_candidates")
      .insert({
        project_id: data.projectId,
        step_id: "roadmap_amendment",
        payload,
        materiality: data.impact,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message ?? "Failed to write amendment");

    try {
      const { insertEngineActivity } = await import("@/lib/engine-activity");
      await insertEngineActivity(sb as never, {
        project_id: data.projectId,
        kind: "roadmap.amendment.proposed",
        title: `Amendment proposed for ${truth.spine as string} · ${truth.field_key as string}`,
        body: data.rationale.slice(0, 400),
        severity: "info",
        actor_email: email,
      });
    } catch {
      /* best-effort */
    }

    try {
      const { notifyOperators } = await import("@/lib/engine-work-notify");
      await notifyOperators(sb as never, {
        projectId: data.projectId,
        kind: "roadmap.amendment.proposed",
        title: `Amendment awaiting review: ${truth.spine as string}`,
        body: `${(truth.field_key as string) ?? ""} — ${data.impact}`,
        href: `/engine/projects/${data.projectId}/amendments`,
      });
    } catch {
      /* best-effort */
    }

    return { amendmentId: (inserted as { id: string }).id };
  });

const decideInput = z.object({
  amendmentId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "defer"]),
  reason: z.string().max(2_000).optional(),
});

export const decideRoadmapAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => decideInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ status: string; truthId?: string }> => {
    const sb = (context as { supabase: Sb }).supabase;
    const email = ((context as { claims?: { email?: string } }).claims?.email ?? "").toLowerCase();
    const isAdmin = await hasRoleForEmail(sb as never, email || null, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { data: row, error } = await sb
      .from("engine_project_synthesis_candidates")
      .select("id, project_id, status, payload, step_id")
      .eq("id", data.amendmentId)
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load amendment");
    const amendment = row as Row | null;
    if (!amendment) throw new Error("Amendment not found");
    if ((amendment.step_id as string) !== "roadmap_amendment") throw new Error("Not an amendment");
    if ((amendment.status as string) !== "pending") throw new Error("Amendment already decided");

    const payload = (amendment.payload as AmendmentPayload) ?? null;
    const proposer = (payload?.actorEmail ?? "").toLowerCase();
    if (proposer && email && proposer === email && data.decision !== "defer") {
      throw new Error(
        "Second-reviewer rule: the person who proposed this amendment cannot decide it. Ask another admin to review.",
      );
    }

    const now = new Date().toISOString();
    const newStatus =
      data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "pending";

    const patch: Record<string, unknown> = {
      status: newStatus,
      decision: data.decision,
      decision_reason: data.reason ?? null,
      reviewer_email: email || null,
      reviewed_at: data.decision === "defer" ? null : now,
    };

    const { error: updErr } = await sb
      .from("engine_project_synthesis_candidates")
      .update(patch)
      .eq("id", data.amendmentId)
      .eq("status", "pending");
    if (updErr) throw new Error(updErr.message ?? "Failed to update amendment");

    let touchedTruthId: string | undefined;
    if (data.decision === "approve" && payload?.target?.truthId) {
      touchedTruthId = payload.target.truthId;
      // Mark the truth row stale — RT-5 doctrine: approved rows are never
      // silently overwritten. The amendment approval acknowledges the drift
      // and forces the next synthesis run to regenerate downstream steps.
      await sb
        .from("engine_spine_field_truth")
        .update({
          status: "stale",
          stale_reason: `amendment ${data.amendmentId}`,
          stale_since: now,
          updated_at: now,
          updated_by_email: email || null,
          updated_by_actor: "human",
        })
        .eq("id", touchedTruthId);

      try {
        await sb.from("engine_change_events").insert({
          project_id: amendment.project_id as string,
          kind: "scope_change",
          title: `Amendment approved: ${payload.target.spine} · ${payload.target.fieldKey}`,
          body: (data.reason ?? payload.rationale ?? "").slice(0, 400),
          severity: "warning",
          affected_module: payload.target.spine,
        });
      } catch {
        /* additive, best-effort */
      }
    }

    try {
      const { insertEngineActivity } = await import("@/lib/engine-activity");
      await insertEngineActivity(sb as never, {
        project_id: amendment.project_id as string,
        kind: `roadmap.amendment.${data.decision}`,
        title: `Amendment ${data.decision}`,
        body: (data.reason ?? "").slice(0, 400),
        severity: data.decision === "approve" ? "warning" : "info",
        actor_email: email || null,
      });
    } catch {
      /* best-effort */
    }

    return { status: newStatus, truthId: touchedTruthId };
  });

function rowToAmendment(r: Row): RoadmapAmendment {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    status: (r.status as RoadmapAmendment["status"]) ?? "pending",
    materiality: (r.materiality as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
    createdByEmail: ((r.payload as AmendmentPayload | null)?.actorEmail as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewerEmail: (r.reviewer_email as string) ?? null,
    decision: (r.decision as string) ?? null,
    decisionReason: (r.decision_reason as string) ?? null,
    payload: (r.payload as AmendmentPayload) ?? ({} as AmendmentPayload),
  };
}
