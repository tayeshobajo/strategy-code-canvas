/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H4 — Outcome scheduler.
//
// Broadens outcome feedback beyond delivered projects. On a cadence, this
// scheduler scans candidate subjects (delivered projects, completed
// milestones, active business engines, recently-resumed cost-paused projects)
// and emits an engine_review_items row per finding so the operator
// approvals queue picks them up. Existing signal computation lives in
// engine-outcome-feedback.functions.ts; this module drives the WHEN, not
// the WHAT.
//
// Idempotency: dedupe by pending items with the same (project_id, title)
// within the last 24h — same principle as H2.
//
// Staff-gated on manual invocation; the /api/public/hooks/outcome-checkins
// route is the automated caller (verifies the apikey header itself).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

export type OutcomeTriggerKind =
  | "delivered_project"
  | "completed_milestone"
  | "active_business_engine"
  | "cost_resumed_project";

export type OutcomeWindow = "7d" | "14d" | "30d" | "60d" | "90d";

export type OutcomeCheckinEmission = {
  subjectId: string;
  subjectName: string;
  triggerKind: OutcomeTriggerKind;
  window: OutcomeWindow;
  title: string;
  reviewItemId: string | null;
  status: "emitted" | "deduped";
};

export type OutcomeSchedulerRunResult = {
  ranAt: string;
  actor: string;
  scanned: {
    deliveredProjects: number;
    completedMilestones: number;
    activeEngines: number;
    costResumedProjects: number;
  };
  emissions: OutcomeCheckinEmission[];
  summary: { emitted: number; deduped: number };
};

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
  return email;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function titleFor(kind: OutcomeTriggerKind, name: string, window: OutcomeWindow): string {
  const label: Record<OutcomeTriggerKind, string> = {
    delivered_project: "Delivered project check-in",
    completed_milestone: "Completed milestone check-in",
    active_business_engine: "Active engine check-in",
    cost_resumed_project: "Cost-resumed project follow-up",
  };
  return `Outcome check-in (${window}) — ${label[kind]}: ${name}`;
}

async function fetchPendingTitles(sb: Sb): Promise<Set<string>> {
  const cutoff = daysAgo(1);
  const { data } = await sb
    .from("engine_review_items")
    .select("project_id, title, created_at")
    .eq("item_type", "outcome_checkin")
    .eq("status", "pending")
    .gte("created_at", cutoff);
  const set = new Set<string>();
  for (const row of data ?? []) set.add(`${row.project_id}::${row.title}`);
  return set;
}

async function insertReview(
  sb: Sb,
  args: {
    projectId: string;
    projectName: string;
    title: string;
    triggerKind: OutcomeTriggerKind;
    window: OutcomeWindow;
    staffEmail: string;
  },
): Promise<string | null> {
  const { data, error } = await sb
    .from("engine_review_items")
    .insert({
      project_id: args.projectId,
      project: args.projectName,
      item_type: "outcome_checkin",
      title: args.title,
      impact: args.window === "7d" ? "high" : args.window === "14d" ? "medium" : "medium",
      source: "outcome_scheduler",
      status: "pending",
      requested_by: args.staffEmail,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await sb.from("engine_activity").insert({
    project_id: args.projectId,
    kind: "outcome.checkin.scheduled",
    title: args.title,
    body: `trigger=${args.triggerKind} window=${args.window}`,
    severity: args.window === "7d" ? "high" : "medium",
  });
  return data?.id ?? null;
}

const RunInput = z
  .object({
    dryRun: z.boolean().optional().default(false),
  })
  .default({ dryRun: false });

export const runOutcomeCheckins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RunInput.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<OutcomeSchedulerRunResult> => {
    const staffEmail = await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;
    return internalRunOutcomeCheckins(sb, staffEmail, data.dryRun);
  });

// Exported for the /api/public/hooks/outcome-checkins route which authenticates
// via the apikey header rather than requireSupabaseAuth. Handler-side caller
// must supply a supabaseAdmin instance.
export async function internalRunOutcomeCheckins(
  sb: Sb,
  actor: string,
  dryRun: boolean,
): Promise<OutcomeSchedulerRunResult> {
  const pendingTitles = await fetchPendingTitles(sb);
  const emissions: OutcomeCheckinEmission[] = [];

  const emit = async (args: {
    projectId: string;
    projectName: string;
    triggerKind: OutcomeTriggerKind;
    window: OutcomeWindow;
  }) => {
    const title = titleFor(args.triggerKind, args.projectName, args.window);
    const key = `${args.projectId}::${title}`;
    if (pendingTitles.has(key)) {
      emissions.push({
        subjectId: args.projectId,
        subjectName: args.projectName,
        triggerKind: args.triggerKind,
        window: args.window,
        title,
        reviewItemId: null,
        status: "deduped",
      });
      return;
    }
    pendingTitles.add(key);
    if (dryRun) {
      emissions.push({
        subjectId: args.projectId,
        subjectName: args.projectName,
        triggerKind: args.triggerKind,
        window: args.window,
        title,
        reviewItemId: null,
        status: "emitted",
      });
      return;
    }
    const id = await insertReview(sb, {
      projectId: args.projectId,
      projectName: args.projectName,
      title,
      triggerKind: args.triggerKind,
      window: args.window,
      staffEmail: actor,
    });
    emissions.push({
      subjectId: args.projectId,
      subjectName: args.projectName,
      triggerKind: args.triggerKind,
      window: args.window,
      title,
      reviewItemId: id,
      status: "emitted",
    });
  };

  // 1) Delivered projects — 30/60/90d windows on completed_at.
  const { data: deliveredProjects = [] } = await sb
    .from("engine_projects")
    .select("id, name, completed_at")
    .not("completed_at", "is", null);
  const nowMs = Date.now();
  for (const p of deliveredProjects ?? []) {
    if (!p.completed_at) continue;
    const ageDays = Math.floor((nowMs - Date.parse(p.completed_at)) / 86_400_000);
    const windows: OutcomeWindow[] = [];
    if (ageDays >= 30 && ageDays < 45) windows.push("30d");
    if (ageDays >= 60 && ageDays < 75) windows.push("60d");
    if (ageDays >= 90 && ageDays < 105) windows.push("90d");
    for (const w of windows) {
      await emit({
        projectId: p.id,
        projectName: p.name ?? "Untitled project",
        triggerKind: "delivered_project",
        window: w,
      });
    }
  }

  // 2) Completed milestones — 14/30d windows.
  const { data: completedMilestones = [] } = await sb
    .from("engine_milestones")
    .select("id, project_id, title, status, updated_at")
    .in("status", ["complete", "completed"]);
  for (const m of completedMilestones ?? []) {
    if (!m.updated_at) continue;
    const ageDays = Math.floor((nowMs - Date.parse(m.updated_at)) / 86_400_000);
    const windows: OutcomeWindow[] = [];
    if (ageDays >= 14 && ageDays < 21) windows.push("14d");
    if (ageDays >= 30 && ageDays < 45) windows.push("30d");
    for (const w of windows) {
      await emit({
        projectId: m.project_id,
        projectName: m.title ?? "Milestone",
        triggerKind: "completed_milestone",
        window: w,
      });
    }
  }

  // 3) Active business engines — 30d cadence.
  const { data: activeEngines = [] } = await sb
    .from("engine_business_engines")
    .select("id, project_id, name, status, updated_at")
    .eq("status", "active");
  for (const e of activeEngines ?? []) {
    if (!e.updated_at || !e.project_id) continue;
    const ageDays = Math.floor((nowMs - Date.parse(e.updated_at)) / 86_400_000);
    if (ageDays >= 30 && ageDays < 45) {
      await emit({
        projectId: e.project_id,
        projectName: e.name ?? "Business engine",
        triggerKind: "active_business_engine",
        window: "30d",
      });
    }
  }

  // 4) Cost-resumed projects — 7d follow-up. Uses cost_paused_at IS NULL as
  // "not currently paused"; we approximate "recently resumed" via updated_at.
  let costResumedProjects: any[] = [];
  try {
    const { data } = await sb
      .from("engine_projects")
      .select("id, name, cost_paused_at, updated_at")
      .is("cost_paused_at", null)
      .gte("updated_at", daysAgo(14));
    costResumedProjects = data ?? [];
  } catch {
    costResumedProjects = [];
  }
  for (const p of costResumedProjects) {
    if (!p.updated_at) continue;
    const ageDays = Math.floor((nowMs - Date.parse(p.updated_at)) / 86_400_000);
    if (ageDays >= 7 && ageDays < 14) {
      await emit({
        projectId: p.id,
        projectName: p.name ?? "Project",
        triggerKind: "cost_resumed_project",
        window: "7d",
      });
    }
  }

  const emittedCount = emissions.filter((e) => e.status === "emitted").length;
  const dedupedCount = emissions.filter((e) => e.status === "deduped").length;

  return {
    ranAt: new Date().toISOString(),
    actor,
    scanned: {
      deliveredProjects: deliveredProjects?.length ?? 0,
      completedMilestones: completedMilestones?.length ?? 0,
      activeEngines: activeEngines?.length ?? 0,
      costResumedProjects: costResumedProjects.length,
    },
    emissions,
    summary: { emitted: emittedCount, deduped: dedupedCount },
  };
}

// Snapshot of recent outcome_checkin review items for the admin surface.
export const getRecentOutcomeCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;
    const { data, error } = await sb
      .from("engine_review_items")
      .select("id, project_id, project, title, impact, status, source, created_at")
      .eq("item_type", "outcome_checkin")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });
