/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H5 — Health explainability.
//
// Every project/engine health verdict must be traceable to concrete drivers.
// This module aggregates open drivers (review items, business-engine
// exceptions, cost-pause state, family-impact blockers, recent audit rows)
// into a ranked driver list with severity + evidence refs so admins can
// click through to source rows.
//
// No schema changes. Reads existing tables.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

export type HealthSeverity = "critical" | "high" | "medium" | "low" | "info";

export type HealthDriver = {
  id: string;
  kind:
    | "review_item"
    | "business_engine_exception"
    | "cost_pause"
    | "family_impact"
    | "audit_event";
  severity: HealthSeverity;
  title: string;
  detail: string;
  createdAt: string;
  evidenceRef: { table: string; id: string } | null;
};

export type HealthExplanation = {
  subjectId: string;
  subjectKind: "project" | "engine";
  subjectName: string;
  status: string;
  verdict: "healthy" | "at_risk" | "blocked" | "unknown";
  score: number;
  drivers: HealthDriver[];
  generatedAt: string;
};

const SEVERITY_WEIGHT: Record<HealthSeverity, number> = {
  critical: 40,
  high: 25,
  medium: 12,
  low: 5,
  info: 1,
};

function normalizeImpact(impact: string | null | undefined): HealthSeverity {
  const v = (impact ?? "").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "info";
}

function verdictFromScore(score: number, drivers: HealthDriver[]): HealthExplanation["verdict"] {
  const hasBlocker = drivers.some(
    (d) => d.severity === "critical" || d.kind === "cost_pause" || d.kind === "family_impact",
  );
  if (hasBlocker) return "blocked";
  if (score >= 70) return "at_risk";
  if (score >= 25) return "at_risk";
  if (drivers.length === 0) return "healthy";
  return "healthy";
}

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
  return email;
}

export async function loadProjectDriversForTest(sb: Sb, projectId: string): Promise<HealthDriver[]> {
  return loadProjectDrivers(sb, projectId);
}

async function loadProjectDrivers(sb: Sb, projectId: string): Promise<HealthDriver[]> {
  const drivers: HealthDriver[] = [];

  // Open review items scoped to the project.
  const { data: reviews } = await sb
    .from("engine_review_items")
    .select("id, title, impact, item_type, status, source, created_at")
    .eq("project_id", projectId)
    .in("status", ["pending", "open"])
    .order("created_at", { ascending: false })
    .limit(20);
  for (const r of reviews ?? []) {
    drivers.push({
      id: `review:${r.id}`,
      kind: r.item_type === "family_impact" ? "family_impact" : "review_item",
      severity: normalizeImpact(r.impact),
      title: r.title,
      detail: `${r.item_type} · source=${r.source ?? "manual"}`,
      createdAt: r.created_at,
      evidenceRef: { table: "engine_review_items", id: r.id },
    });
  }

  // Business engine exceptions (open) for this project's engines.
  const { data: engines } = await sb
    .from("engine_business_engines")
    .select("id, name")
    .eq("project_id", projectId);
  const engineIds = (engines ?? []).map((e: any) => e.id);
  if (engineIds.length) {
    const { data: exceptions } = await sb
      .from("engine_business_engine_exceptions")
      .select("id, engine_id, title, severity, status, created_at")
      .in("engine_id", engineIds)
      .in("status", ["open", "escalated"])
      .order("created_at", { ascending: false })
      .limit(20);
    const nameById = new Map((engines ?? []).map((e: any) => [e.id, e.name]));
    for (const x of exceptions ?? []) {
      drivers.push({
        id: `exception:${x.id}`,
        kind: "business_engine_exception",
        severity: normalizeImpact(x.severity),
        title: `${nameById.get(x.engine_id) ?? "Engine"} — ${x.title}`,
        detail: `status=${x.status}`,
        createdAt: x.created_at,
        evidenceRef: { table: "engine_business_engine_exceptions", id: x.id },
      });
    }
  }

  // Cost-pause state (columns are optional depending on H1 migration state).
  try {
    const { data: proj } = await sb
      .from("engine_projects")
      .select("cost_paused_at, cost_paused_reason")
      .eq("id", projectId)
      .maybeSingle();
    if (proj?.cost_paused_at) {
      drivers.push({
        id: `cost:${projectId}`,
        kind: "cost_pause",
        severity: "critical",
        title: "Project paused for cost review",
        detail: proj.cost_paused_reason ?? "Cost cap tripped",
        createdAt: proj.cost_paused_at,
        evidenceRef: { table: "engine_projects", id: projectId },
      });
    }
  } catch {
    // cost_paused_* columns not present yet — ignore.
  }

  // Recent high/critical audit events (last 5).
  try {
    const { data: audits } = await sb
      .from("engine_activity")
      .select("id, kind, title, body, severity, created_at")
      .eq("project_id", projectId)
      .in("severity", ["high", "critical"])
      .order("created_at", { ascending: false })
      .limit(5);
    for (const a of audits ?? []) {
      drivers.push({
        id: `audit:${a.id}`,
        kind: "audit_event",
        severity: normalizeImpact(a.severity),
        title: a.title ?? a.kind,
        detail: a.body ?? a.kind,
        createdAt: a.created_at,
        evidenceRef: { table: "engine_activity", id: a.id },
      });
    }
  } catch {
    // engine_activity may vary; skip on error.
  }

  drivers.sort((a, b) => {
    const w = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (w !== 0) return w;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return drivers;
}

function scoreDrivers(drivers: HealthDriver[]): number {
  let score = 0;
  for (const d of drivers) score += SEVERITY_WEIGHT[d.severity];
  return Math.min(100, score);
}

const ProjectInput = z.object({ projectId: z.string().uuid() });

export const explainProjectHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ProjectInput.parse(raw))
  .handler(async ({ data, context }): Promise<HealthExplanation> => {
    await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;
    const { data: project, error } = await sb
      .from("engine_projects")
      .select("id, name, status")
      .eq("id", data.projectId)
      .single();
    if (error) throw new Error(error.message);
    const drivers = await loadProjectDrivers(sb, data.projectId);
    const score = scoreDrivers(drivers);
    return {
      subjectId: project.id,
      subjectKind: "project",
      subjectName: project.name ?? "Untitled project",
      status: project.status ?? "unknown",
      verdict: verdictFromScore(score, drivers),
      score,
      drivers,
      generatedAt: new Date().toISOString(),
    };
  });

const EngineInput = z.object({ engineId: z.string().uuid() });

export const explainEngineHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EngineInput.parse(raw))
  .handler(async ({ data, context }): Promise<HealthExplanation> => {
    await assertStaff(context);
    const sb = (context as unknown as Ctx).supabase;
    const { data: engine, error } = await sb
      .from("engine_business_engines")
      .select("id, name, status, project_id")
      .eq("id", data.engineId)
      .single();
    if (error) throw new Error(error.message);

    const drivers: HealthDriver[] = [];
    const { data: exceptions } = await sb
      .from("engine_business_engine_exceptions")
      .select("id, title, severity, status, created_at")
      .eq("engine_id", data.engineId)
      .in("status", ["open", "escalated"])
      .order("created_at", { ascending: false })
      .limit(20);
    for (const x of exceptions ?? []) {
      drivers.push({
        id: `exception:${x.id}`,
        kind: "business_engine_exception",
        severity: normalizeImpact(x.severity),
        title: x.title,
        detail: `status=${x.status}`,
        createdAt: x.created_at,
        evidenceRef: { table: "engine_business_engine_exceptions", id: x.id },
      });
    }
    drivers.sort(
      (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
        b.createdAt.localeCompare(a.createdAt),
    );
    const score = scoreDrivers(drivers);
    return {
      subjectId: engine.id,
      subjectKind: "engine",
      subjectName: engine.name ?? "Business engine",
      status: engine.status ?? "unknown",
      verdict: verdictFromScore(score, drivers),
      score,
      drivers,
      generatedAt: new Date().toISOString(),
    };
  });
