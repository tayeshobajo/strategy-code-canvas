/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 10C — Post-Delivery Learning Loop
//
// Outcome surveys and 30/60/90-day check-ins flow back into the engine
// after a project is delivered. Delivery outcomes are stored as
// engine_activity events (kind = 'outcome_survey_submitted') so no new
// tables are required.
//
// This module provides:
//   getPostDeliveryLearningReport — cross-project survey + check-in status
//   getProjectDeliverySurveys    — all submitted surveys for one project
//   recordOutcomeSurvey          — operator submits / records a survey
//
// Check-in schedule derived from published_at:
//   30 days  — initial launch check
//   60 days  — first progress review
//   90 days  — outcome assessment
//
// Status of each check-in:
//   pending   — due date has not passed
//   due       — within ±7 days of due date, no survey submitted
//   overdue   — past due date, no survey submitted
//   complete  — survey submitted for that window
//   skipped   — manually marked skipped via activity event

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

type Sb = any;
type StaffCtx = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

async function assertStaff(ctx: StaffCtx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckInWindow = "30d" | "60d" | "90d";
export type CheckInStatus = "pending" | "due" | "overdue" | "complete" | "skipped";

export type CheckIn = {
  window: CheckInWindow;
  dueAt: string;         // ISO date
  status: CheckInStatus;
  surveyId: string | null; // engine_activity.id if survey submitted
  submittedAt: string | null;
  satisfactionScore: number | null; // 1–10
  notes: string | null;
};

export type ProjectDeliveryOutcome = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  publishedAt: string;   // when roadmap was published / delivered
  checkIns: CheckIn[];
  overallSatisfactionScore: number | null; // avg of submitted scores
  surveyCount: number;
  pendingCheckIns: number;
  dueCheckIns: number;
  overdueCheckIns: number;
  completedCheckIns: number;
  learningReady: boolean; // all 3 check-ins complete
  generatedAt: string;
};

export type OutcomeSurveyRecord = {
  id: string;
  projectId: string;
  projectName: string;
  window: CheckInWindow;
  satisfactionScore: number | null;
  notes: string | null;
  submittedBy: string | null;
  submittedAt: string;
};

export type PostDeliveryLearningReport = {
  projects: ProjectDeliveryOutcome[];
  totalDelivered: number;
  learningReadyCount: number;
  overdueCount: number;   // projects with ≥1 overdue check-in
  dueCount: number;       // projects with ≥1 due check-in
  avgSatisfactionScore: number | null;
  totalSurveysSubmitted: number;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WINDOW_DAYS: Record<CheckInWindow, number> = { "30d": 30, "60d": 60, "90d": 90 };
const DUE_WINDOW_DAYS = 7; // ±7 days counts as "due"

function computeCheckInStatus(
  dueAt: Date,
  now: Date,
  survey: { submittedAt: string; notes: string | null; satisfactionScore: number | null } | null,
  skipped: boolean,
): CheckInStatus {
  if (skipped) return "skipped";
  if (survey) return "complete";
  const msDiff = dueAt.getTime() - now.getTime();
  const daysDiff = msDiff / (1000 * 60 * 60 * 24);
  if (daysDiff < -DUE_WINDOW_DAYS) return "overdue";
  if (Math.abs(daysDiff) <= DUE_WINDOW_DAYS) return "due";
  return "pending";
}

function parseActivityMeta(meta: any): {
  window?: CheckInWindow;
  satisfactionScore?: number | null;
  notes?: string | null;
} {
  if (!meta || typeof meta !== "object") return {};
  return {
    window: meta.window,
    satisfactionScore: typeof meta.satisfaction_score === "number" ? meta.satisfaction_score : null,
    notes: typeof meta.notes === "string" ? meta.notes : null,
  };
}

type ProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  published_at: string | null;
  client_name: string | null;
};

type ActivityRow = {
  id: string;
  project_id: string;
  kind: string;
  created_at: string;
  user_email: string | null;
  meta: any;
};

function buildProjectOutcome(
  proj: ProjectRow,
  surveys: ActivityRow[],
  skips: ActivityRow[],
  now: Date,
): ProjectDeliveryOutcome {
  const publishedAt = new Date(proj.published_at!);

  const surveyByWindow = new Map<CheckInWindow, ActivityRow>();
  for (const s of surveys) {
    const { window } = parseActivityMeta(s.meta);
    if (window) surveyByWindow.set(window, s);
  }

  const skipByWindow = new Set<CheckInWindow>();
  for (const sk of skips) {
    const { window } = parseActivityMeta(sk.meta);
    if (window) skipByWindow.add(window);
  }

  const checkIns: CheckIn[] = (["30d", "60d", "90d"] as CheckInWindow[]).map((w) => {
    const dueAt = new Date(publishedAt.getTime() + WINDOW_DAYS[w] * 86400 * 1000);
    const survey = surveyByWindow.get(w) ?? null;
    const { satisfactionScore, notes } = survey ? parseActivityMeta(survey.meta) : {};
    const status = computeCheckInStatus(dueAt, now, survey ? { submittedAt: survey.created_at, notes: notes ?? null, satisfactionScore: satisfactionScore ?? null } : null, skipByWindow.has(w));

    return {
      window: w,
      dueAt: dueAt.toISOString(),
      status,
      surveyId: survey?.id ?? null,
      submittedAt: survey?.created_at ?? null,
      satisfactionScore: satisfactionScore ?? null,
      notes: notes ?? null,
    };
  });

  const submittedCheckIns = checkIns.filter((c) => c.status === "complete");
  const scores = submittedCheckIns
    .map((c) => c.satisfactionScore)
    .filter((s): s is number => s !== null);
  const overallScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;

  return {
    projectId: proj.id,
    projectName: proj.name ?? "Untitled project",
    clientName: proj.client_name ?? null,
    publishedAt: proj.published_at!,
    checkIns,
    overallSatisfactionScore: overallScore,
    surveyCount: submittedCheckIns.length,
    pendingCheckIns: checkIns.filter((c) => c.status === "pending").length,
    dueCheckIns: checkIns.filter((c) => c.status === "due").length,
    overdueCheckIns: checkIns.filter((c) => c.status === "overdue").length,
    completedCheckIns: submittedCheckIns.length,
    learningReady: submittedCheckIns.length === 3,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getPostDeliveryLearningReport — cross-project check-in status
// ---------------------------------------------------------------------------

export const getPostDeliveryLearningReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostDeliveryLearningReport> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const now = new Date();

    // Delivered projects: published_at IS NOT NULL
    const { data: projects, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,status,published_at,client_name")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(100);
    if (pErr) throw new Error(pErr.message ?? "Failed to load delivered projects");

    const projectRows = (projects ?? []) as ProjectRow[];

    if (projectRows.length === 0) {
      return {
        projects: [], totalDelivered: 0, learningReadyCount: 0,
        overdueCount: 0, dueCount: 0, avgSatisfactionScore: null,
        totalSurveysSubmitted: 0, generatedAt: now.toISOString(),
      };
    }

    const projectIds = projectRows.map((p) => p.id);

    // Batch-fetch survey and skip activity events
    const [surveyRes, skipRes] = await Promise.all([
      sb
        .from("engine_activity")
        .select("id,project_id,kind,created_at,user_email,meta")
        .in("project_id", projectIds)
        .eq("kind", "outcome_survey_submitted")
        .order("created_at", { ascending: true }),
      sb
        .from("engine_activity")
        .select("id,project_id,kind,created_at,user_email,meta")
        .in("project_id", projectIds)
        .eq("kind", "outcome_check_in_skipped")
        .order("created_at", { ascending: true }),
    ]);

    const surveyRows = ((surveyRes.data ?? []) as ActivityRow[]);
    const skipRows = ((skipRes.data ?? []) as ActivityRow[]);

    function byProject(rows: ActivityRow[]): Map<string, ActivityRow[]> {
      const m = new Map<string, ActivityRow[]>();
      for (const r of rows) {
        if (!m.has(r.project_id)) m.set(r.project_id, []);
        m.get(r.project_id)!.push(r);
      }
      return m;
    }

    const surveysByProject = byProject(surveyRows);
    const skipsByProject = byProject(skipRows);

    const projectOutcomes = projectRows.map((proj) =>
      buildProjectOutcome(
        proj,
        surveysByProject.get(proj.id) ?? [],
        skipsByProject.get(proj.id) ?? [],
        now,
      ),
    );

    // Sort: overdue first, then due, then pending, then complete
    const PRIORITY = (p: ProjectDeliveryOutcome) => {
      if (p.overdueCheckIns > 0) return 0;
      if (p.dueCheckIns > 0) return 1;
      if (p.pendingCheckIns > 0) return 2;
      return 3;
    };
    projectOutcomes.sort((a, b) => PRIORITY(a) - PRIORITY(b));

    const learningReadyCount = projectOutcomes.filter((p) => p.learningReady).length;
    const overdueCount = projectOutcomes.filter((p) => p.overdueCheckIns > 0).length;
    const dueCount = projectOutcomes.filter((p) => p.dueCheckIns > 0 && p.overdueCheckIns === 0).length;
    const totalSurveysSubmitted = projectOutcomes.reduce((s, p) => s + p.surveyCount, 0);

    const allScores = projectOutcomes
      .map((p) => p.overallSatisfactionScore)
      .filter((s): s is number => s !== null);
    const avgScore = allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
      : null;

    return {
      projects: projectOutcomes,
      totalDelivered: projectOutcomes.length,
      learningReadyCount,
      overdueCount,
      dueCount,
      avgSatisfactionScore: avgScore,
      totalSurveysSubmitted,
      generatedAt: now.toISOString(),
    };
  });

// ---------------------------------------------------------------------------
// getProjectDeliverySurveys — all surveys submitted for one project
// ---------------------------------------------------------------------------

export const getProjectDeliverySurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<OutcomeSurveyRecord[]> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;

    const [pRes, aRes] = await Promise.all([
      sb.from("engine_projects").select("id,name").eq("id", data.projectId).single(),
      sb
        .from("engine_activity")
        .select("id,project_id,kind,created_at,user_email,meta")
        .eq("project_id", data.projectId)
        .eq("kind", "outcome_survey_submitted")
        .order("created_at", { ascending: false }),
    ]);

    const proj = pRes.data;
    const surveys = (aRes.data ?? []) as ActivityRow[];

    return surveys.map((s): OutcomeSurveyRecord => {
      const { window, satisfactionScore, notes } = parseActivityMeta(s.meta);
      return {
        id: s.id,
        projectId: s.project_id,
        projectName: proj?.name ?? "Unknown",
        window: window ?? "30d",
        satisfactionScore: satisfactionScore ?? null,
        notes: notes ?? null,
        submittedBy: s.user_email ?? null,
        submittedAt: s.created_at,
      };
    });
  });

// ---------------------------------------------------------------------------
// recordOutcomeSurvey — operator records an outcome survey
// ---------------------------------------------------------------------------

const RecordOutcomeSurveyInput = z.object({
  projectId: z.string().uuid(),
  window: z.enum(["30d", "60d", "90d"]),
  satisfactionScore: z.number().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const recordOutcomeSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RecordOutcomeSurveyInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const ctx = context as unknown as StaffCtx;
    const userEmail = (ctx.claims?.email as string | undefined) ?? null;

    const { data: inserted, error } = await sb
      .from("engine_activity")
      .insert({
        project_id: data.projectId,
        kind: "outcome_survey_submitted",
        user_email: userEmail,
        meta: {
          window: data.window,
          satisfaction_score: data.satisfactionScore ?? null,
          notes: data.notes ?? null,
        },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message ?? "Failed to record outcome survey");
    return { id: inserted.id };
  });

// ---------------------------------------------------------------------------
// skipCheckIn — operator marks a check-in as skipped
// ---------------------------------------------------------------------------

const SkipCheckInInput = z.object({
  projectId: z.string().uuid(),
  window: z.enum(["30d", "60d", "90d"]),
  reason: z.string().max(500).nullable().optional(),
});

export const skipCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SkipCheckInInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    await assertStaff(context as unknown as StaffCtx);
    const sb = (context as unknown as StaffCtx).supabase;
    const ctx = context as unknown as StaffCtx;
    const userEmail = (ctx.claims?.email as string | undefined) ?? null;

    const { data: inserted, error } = await sb
      .from("engine_activity")
      .insert({
        project_id: data.projectId,
        kind: "outcome_check_in_skipped",
        user_email: userEmail,
        meta: {
          window: data.window,
          reason: data.reason ?? null,
        },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message ?? "Failed to skip check-in");
    return { id: inserted.id };
  });
