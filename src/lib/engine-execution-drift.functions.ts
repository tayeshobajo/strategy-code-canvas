/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RT-6 — Execution Drift Monitor server functions.
 *
 * Detects and manages divergence between execution work (tasks, evidence,
 * delivery items) and the approved strategic anchors (thesis, milestone
 * rationale, execution boundary, capability registry).
 *
 * All writes require the second-reviewer rule: a signal authored by AI
 * cannot be resolved/dismissed by the same actor (enforced at the DB via
 * `enforce_no_ai_self_resolve_drift`).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";
import {
  detectBoundaryDrift,
  detectRationaleDrift,
  detectThesisDrift,
  detectDeliveryDrift,
  type DraftSignal,
} from "@/lib/execution-drift/detectors";

type Sb = { from: (t: string) => any };
type Ctx = { supabase: Sb; claims?: { email?: string } };

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase as never, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
  return email;
}

export type DriftSignalRow = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  sourceKind: DraftSignal["source_kind"];
  sourceId: string;
  anchorKind: DraftSignal["anchor_kind"];
  severity: DraftSignal["severity"];
  classification: DraftSignal["classification"];
  summary: string;
  suggestedAction: string | null;
  rationale: Record<string, any>;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  createdByKind: "ai" | "human" | "detector";
  createdByEmail: string | null;
  resolvedByEmail: string | null;
  resolvedAt: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  detectorVersion: string;
  model: string | null;
  createdAt: string;
};

function rowToSignal(r: any): DriftSignalRow {
  return {
    id: r.id,
    projectId: r.project_id,
    milestoneId: r.milestone_id,
    sourceKind: r.source_kind,
    sourceId: r.source_id,
    anchorKind: r.anchor_kind,
    severity: r.severity,
    classification: r.classification,
    summary: r.summary,
    suggestedAction: r.suggested_action,
    rationale: r.rationale_json ?? {},
    status: r.status,
    createdByKind: r.created_by_kind,
    createdByEmail: r.created_by_email,
    resolvedByEmail: r.resolved_by_email,
    resolvedAt: r.resolved_at,
    resolutionAction: r.resolution_action,
    resolutionNote: r.resolution_note,
    detectorVersion: r.detector_version,
    model: r.model,
    createdAt: r.created_at,
  };
}

// ---- list ----

const listInput = z.object({
  projectId: z.string().uuid(),
  status: z.enum(["open", "acknowledged", "resolved", "dismissed", "all"]).default("open"),
  severity: z.enum(["low", "medium", "high", "all"]).default("all"),
  anchorKind: z
    .enum(["thesis", "rationale", "boundary", "capability", "delivery_scope", "all"])
    .default("all"),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listExecutionDriftSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw))
  .handler(async ({ context, data }): Promise<DriftSignalRow[]> => {
    const sb = (context as Ctx).supabase;
    await assertStaff(context as Ctx);
    let q = sb
      .from("engine_execution_drift_signals")
      .select("*")
      .eq("project_id", data.projectId)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.severity !== "all") q = q.eq("severity", data.severity);
    if (data.anchorKind !== "all") q = q.eq("anchor_kind", data.anchorKind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message ?? "Failed to load drift signals");
    return ((rows as any[]) ?? []).map(rowToSignal);
  });

// ---- summary ----

export const getDriftSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{
    open: number;
    high: number;
    medium: number;
    low: number;
    byAnchor: Record<string, number>;
    lastScanAt: string | null;
  }> => {
    const sb = (context as Ctx).supabase;
    await assertStaff(context as Ctx);
    const { data: rows } = await sb
      .from("engine_execution_drift_signals")
      .select("severity, anchor_kind, status, created_at")
      .eq("project_id", data.projectId)
      .in("status", ["open", "acknowledged"])
      .limit(500);
    const arr = (rows as any[]) ?? [];
    const byAnchor: Record<string, number> = {};
    let high = 0, medium = 0, low = 0;
    let lastScanAt: string | null = null;
    for (const r of arr) {
      byAnchor[r.anchor_kind] = (byAnchor[r.anchor_kind] ?? 0) + 1;
      if (r.severity === "high") high += 1;
      else if (r.severity === "medium") medium += 1;
      else low += 1;
      if (!lastScanAt || r.created_at > lastScanAt) lastScanAt = r.created_at;
    }
    return { open: arr.length, high, medium, low, byAnchor, lastScanAt };
  });

// ---- scan ----

const scanInput = z.object({
  projectId: z.string().uuid(),
  scopes: z
    .array(z.enum(["boundary", "rationale", "thesis", "delivery"]))
    .default(["boundary", "rationale", "thesis", "delivery"]),
});

export const runExecutionDriftScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => scanInput.parse(raw))
  .handler(async ({ context, data }): Promise<{
    inserted: number;
    updated: number;
    scoped: string[];
    highSeverity: number;
  }> => {
    const sb = (context as Ctx).supabase;
    const email = await assertStaff(context as Ctx);
    const actor = email || null;

    const chunks: DraftSignal[][] = [];
    if (data.scopes.includes("boundary"))
      chunks.push(await detectBoundaryDrift(sb, data.projectId, actor));
    if (data.scopes.includes("rationale"))
      chunks.push(await detectRationaleDrift(sb, data.projectId, actor));
    if (data.scopes.includes("thesis"))
      chunks.push(await detectThesisDrift(sb, data.projectId, actor));
    if (data.scopes.includes("delivery"))
      chunks.push(await detectDeliveryDrift(sb, data.projectId, actor));

    const drafts = chunks.flat();
    let inserted = 0;
    let updated = 0;
    let highSeverity = 0;
    for (const d of drafts) {
      if (d.severity === "high") highSeverity += 1;
      const { data: up, error } = await sb
        .from("engine_execution_drift_signals")
        .upsert(d, { onConflict: "project_id,source_kind,source_id,anchor_kind" })
        .select("id, created_at")
        .single();
      if (error) {
        console.warn("[rt6.scan] upsert failed", error);
        continue;
      }
      const row = up as { id: string; created_at: string } | null;
      if (row) {
        // Best-effort insert-vs-update detection
        const diff = Date.now() - new Date(row.created_at).getTime();
        if (diff < 5_000) inserted += 1;
        else updated += 1;
      }
    }

    // Activity + notifications (best-effort)
    try {
      const { insertEngineActivity } = await import("@/lib/engine-activity");
      await insertEngineActivity(sb as never, {
        project_id: data.projectId,
        kind: "drift.scan.completed",
        title: `Execution drift scan · ${inserted} new · ${highSeverity} high`,
        body: `Scopes: ${data.scopes.join(", ")}`,
        severity: highSeverity > 0 ? "warning" : "info",
        actor_email: actor,
      });
    } catch {
      /* best-effort */
    }
    if (highSeverity > 0) {
      try {
        const { notifyOperators } = await import("@/lib/engine-work-notify");
        await notifyOperators(sb as never, {
          projectId: data.projectId,
          kind: "drift.high",
          title: `Execution drift: ${highSeverity} high-severity signal${highSeverity === 1 ? "" : "s"}`,
          body: `Scopes ${data.scopes.join(", ")}`,
          href: `/engine/projects/${data.projectId}/drift`,
        });
      } catch {
        /* best-effort */
      }
    }
    return { inserted, updated, scoped: data.scopes, highSeverity };
  });

// ---- decisions ----

const decideInput = z.object({
  signalId: z.string().uuid(),
  decision: z.enum(["acknowledge", "resolve", "dismiss"]),
  action: z
    .enum(["amend_roadmap", "update_boundary", "reject_work", "reassign", "ignore", "other"])
    .optional(),
  note: z.string().max(2_000).optional(),
});

export const decideDriftSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => decideInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true; status: string }> => {
    const sb = (context as Ctx).supabase;
    const email = await assertStaff(context as Ctx);

    const { data: current, error: readErr } = await sb
      .from("engine_execution_drift_signals")
      .select("id, project_id, status, created_by_kind, created_by_email, severity")
      .eq("id", data.signalId)
      .maybeSingle();
    if (readErr || !current) throw new Error("Drift signal not found");

    if (
      (data.decision === "resolve" || data.decision === "dismiss") &&
      (current as any).created_by_kind === "ai" &&
      ((current as any).created_by_email ?? "").toLowerCase() === email.toLowerCase()
    ) {
      throw new Error("You cannot resolve a signal you authored (second reviewer required).");
    }

    const patch: Record<string, unknown> = {};
    if (data.decision === "acknowledge") {
      patch.status = "acknowledged";
      patch.resolved_by_email = email;
    } else if (data.decision === "resolve") {
      patch.status = "resolved";
      patch.resolved_by_email = email;
      patch.resolved_at = new Date().toISOString();
      patch.resolution_action = data.action ?? "other";
      patch.resolution_note = data.note ?? null;
    } else {
      patch.status = "dismissed";
      patch.resolved_by_email = email;
      patch.resolved_at = new Date().toISOString();
      patch.resolution_action = "ignore";
      patch.resolution_note = data.note ?? null;
    }

    const { error } = await sb
      .from("engine_execution_drift_signals")
      .update(patch)
      .eq("id", data.signalId);
    if (error) throw new Error(error.message ?? "Failed to update signal");

    try {
      const { insertEngineActivity } = await import("@/lib/engine-activity");
      await insertEngineActivity(sb as never, {
        project_id: (current as any).project_id,
        kind: `drift.${data.decision}`,
        title: `Drift signal ${data.decision}${data.action ? ` (${data.action})` : ""}`,
        body: (data.note ?? "").slice(0, 400),
        severity: "info",
        actor_email: email,
      });
    } catch {
      /* best-effort */
    }

    return { ok: true, status: patch.status as string };
  });
