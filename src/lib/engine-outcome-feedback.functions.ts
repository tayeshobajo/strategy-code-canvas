import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const SIGNAL_KINDS = [
  "timeline_accuracy",
  "budget_accuracy",
  "scope_drift",
  "client_satisfaction",
  "delivery_completeness",
  "evidence_quality",
] as const;

type OutcomeSignalKind = (typeof SIGNAL_KINDS)[number];
type SignalConfidence = "high" | "medium" | "low";
type JsonObject = Record<string, unknown>;

type ProjectRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  completed_at: string | null;
  investment_confirmed_at: string | null;
  blueprint: unknown;
  roadmap: unknown;
  investment: unknown;
  delivery: unknown;
};

type MilestoneRow = {
  project_id: string;
  status: string | null;
  estimated_cost_cents: number | null;
  confidence: number | null;
};

type ActivityRow = {
  id: string;
  project_id: string | null;
  kind: string;
  title: string | null;
  body: string | null;
  metadata: unknown;
  created_at: string;
};

type EngineActivitySelect = {
  select: (columns: string) => {
    in: (
      column: string,
      values: string[],
    ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  };
  insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

export type OutcomeFeedbackSignal = {
  projectId: string;
  projectName: string;
  signalKind:
    | "timeline_accuracy"
    | "budget_accuracy"
    | "scope_drift"
    | "client_satisfaction"
    | "delivery_completeness"
    | "evidence_quality";
  value: number;
  rawData: string;
  confidence: "high" | "medium" | "low";
  recordedAt: string;
};

export type OutcomeSynthesis = {
  patternKind: string;
  description: string;
  affectedProjectCount: number;
  avgScore: number;
  recommendation: string;
};

export type WorkspaceOutcomeFeedbackReport = {
  signals: OutcomeFeedbackSignal[];
  syntheses: OutcomeSynthesis[];
  totalProjects: number;
  projectsWithFeedback: number;
  avgTimelineAccuracy: number | null;
  avgBudgetAccuracy: number | null;
  avgDeliveryCompleteness: number | null;
  topPattern: OutcomeSynthesis | null;
  generatedAt: string;
};

async function assertOperatorOrAdmin(context: {
  claims?: Record<string, unknown>;
  supabase: unknown;
}) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  if (!email) throw new Error("Not signed in");
  const supabase = context.supabase as Parameters<typeof hasRoleForEmail>[0];
  const [isAdmin, isOperator] = await Promise.all([
    hasRoleForEmail(supabase, email, "admin"),
    hasRoleForEmail(supabase, email, "operator"),
  ]);
  if (!isAdmin && !isOperator) {
    throw new Error("Forbidden: operator or admin role required");
  }
  return { email, isAdmin, isOperator };
}

async function assertAdmin(context: { claims?: Record<string, unknown>; supabase: unknown }) {
  const staff = await assertOperatorOrAdmin(context);
  if (!staff.isAdmin) throw new Error("Forbidden: admin role required");
  return staff;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function extractNestedNumber(value: unknown, keyHints: string[]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    const match = trimmed.match(/(\d+(\.\d+)?)/);
    if (match) return Number(match[1]);
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractNestedNumber(item, keyHints);
      if (found != null) return found;
    }
    return null;
  }
  const obj = asObject(value);
  if (!obj) return null;

  for (const hint of keyHints) {
    for (const [key, nested] of Object.entries(obj)) {
      if (key.toLowerCase() === hint.toLowerCase()) {
        const found = extractNestedNumber(nested, keyHints);
        if (found != null) return found;
      }
    }
  }

  for (const [key, nested] of Object.entries(obj)) {
    if (keyHints.some((hint) => key.toLowerCase().includes(hint.toLowerCase()))) {
      const found = extractNestedNumber(nested, keyHints);
      if (found != null) return found;
    }
  }

  for (const nested of Object.values(obj)) {
    const found = extractNestedNumber(nested, keyHints);
    if (found != null) return found;
  }
  return null;
}

function extractRoadmapMilestoneCount(roadmap: unknown) {
  const roadmapObj = asObject(roadmap);
  if (!roadmapObj) return 0;

  const directMilestones = roadmapObj.milestones;
  if (Array.isArray(directMilestones)) return directMilestones.length;

  const phases = Array.isArray(roadmapObj.phases) ? roadmapObj.phases : [];
  return phases.reduce((sum, phase) => {
    const phaseObj = asObject(phase);
    const milestones = Array.isArray(phaseObj?.milestones) ? phaseObj?.milestones.length : 0;
    return sum + milestones;
  }, 0);
}

function buildTimelineSignal(project: ProjectRow): OutcomeFeedbackSignal {
  const recordedAt =
    project.completed_at ?? project.investment_confirmed_at ?? new Date().toISOString();
  const startedAt = parseIsoDate(project.investment_confirmed_at);
  const completedAt = parseIsoDate(project.completed_at);

  if (!startedAt || !completedAt || completedAt <= startedAt) {
    return {
      projectId: project.id,
      projectName: project.name ?? "Untitled project",
      signalKind: "timeline_accuracy",
      value: 50,
      rawData:
        "Missing valid investment-confirmed or completed dates, so timeline accuracy is neutral.",
      confidence: "low",
      recordedAt,
    };
  }

  const investment = asObject(project.investment);
  const estimatedDays =
    extractNestedNumber(investment, [
      "estimated_days",
      "duration_days",
      "timeline_days",
      "delivery_days",
      "days",
    ]) ??
    (() => {
      const weeks = extractNestedNumber(investment, [
        "estimated_weeks",
        "duration_weeks",
        "timeline_weeks",
        "weeks",
      ]);
      return weeks != null ? weeks * 7 : null;
    })();

  const actualDays = Math.max(1, Math.round((completedAt - startedAt) / 86_400_000));
  if (!estimatedDays || estimatedDays <= 0) {
    return {
      projectId: project.id,
      projectName: project.name ?? "Untitled project",
      signalKind: "timeline_accuracy",
      value: 50,
      rawData: `Actual duration was ${actualDays} day(s), but no estimated duration was found in investment JSON.`,
      confidence: "low",
      recordedAt,
    };
  }

  const ratio = actualDays / estimatedDays;
  const deltaPct = Math.abs(ratio - 1) * 100;
  const value = clampScore(100 - deltaPct);
  const confidence: SignalConfidence = deltaPct <= 10 ? "high" : deltaPct <= 25 ? "medium" : "low";

  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    signalKind: "timeline_accuracy",
    value,
    rawData: `Estimated ${Math.round(estimatedDays)} day(s); actual ${actualDays} day(s).`,
    confidence,
    recordedAt,
  };
}

function buildDeliveryCompletenessSignal(
  project: ProjectRow,
  milestones: MilestoneRow[],
): OutcomeFeedbackSignal {
  const total = milestones.length;
  const completed = milestones.filter((m) => (m.status ?? "").toLowerCase() === "complete").length;
  const value = total === 0 ? 0 : clampScore((completed / total) * 100);
  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    signalKind: "delivery_completeness" as const,
    value,
    rawData:
      total === 0
        ? "No milestones found for this project."
        : `${completed} of ${total} milestone(s) reached complete status.`,
    confidence: total >= 5 ? "high" : total >= 2 ? "medium" : "low",
    recordedAt: project.completed_at ?? project.created_at ?? new Date().toISOString(),
  };
}

function buildScopeDriftSignal(
  project: ProjectRow,
  milestones: MilestoneRow[],
): OutcomeFeedbackSignal {
  const roadmapCount = extractRoadmapMilestoneCount(project.roadmap);
  const actualCount = milestones.length;

  let value = 100;
  let confidence: SignalConfidence = "low";
  let rawData = `Roadmap milestone baseline unavailable; actual milestone count is ${actualCount}.`;

  if (roadmapCount > 0) {
    const overagePct = ((actualCount - roadmapCount) / roadmapCount) * 100;
    confidence = "high";
    if (overagePct > 20) value = 40;
    else if (overagePct > 10) value = 70;
    else value = 100;

    rawData = `Roadmap planned ${roadmapCount} milestone(s); actual count is ${actualCount} (${Math.round(overagePct)}% drift).`;
  }

  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    signalKind: "scope_drift" as const,
    value,
    rawData,
    confidence,
    recordedAt: project.completed_at ?? project.created_at ?? new Date().toISOString(),
  };
}

function buildEvidenceQualitySignal(
  project: ProjectRow,
  milestones: MilestoneRow[],
): OutcomeFeedbackSignal {
  const confidences = milestones
    .map((milestone) => milestone.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const value = confidences.length
    ? clampScore(confidences.reduce((sum, score) => sum + score, 0) / confidences.length)
    : 0;

  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    signalKind: "evidence_quality" as const,
    value,
    rawData:
      confidences.length > 0
        ? `Average milestone confidence is ${value}% across ${confidences.length} milestone(s).`
        : "No milestone confidence scores were available.",
    confidence: confidences.length >= 5 ? "high" : confidences.length >= 2 ? "medium" : "low",
    recordedAt: project.completed_at ?? project.created_at ?? new Date().toISOString(),
  };
}

function parseSurveySignal(
  project: ProjectRow,
  activity: ActivityRow,
  signalKind: OutcomeSignalKind,
): OutcomeFeedbackSignal | null {
  const metadata = asObject(activity.metadata) ?? {};
  const metaKind = typeof metadata.signalKind === "string" ? metadata.signalKind : null;

  if (activity.kind === "outcome_feedback_signal") {
    if (metaKind !== signalKind) return null;
    const rawValue =
      typeof metadata.value === "number"
        ? metadata.value
        : typeof metadata.value === "string"
          ? Number(metadata.value)
          : NaN;
    if (!Number.isFinite(rawValue)) return null;
    return {
      projectId: project.id,
      projectName: project.name ?? "Untitled project",
      signalKind,
      value: clampScore(rawValue),
      rawData:
        (typeof metadata.rawData === "string" && metadata.rawData) ||
        activity.body ||
        `${signalKind} recorded manually.`,
      confidence: "high",
      recordedAt: activity.created_at,
    };
  }

  if (activity.kind === "outcome_check_in_skipped" && signalKind === "client_satisfaction") {
    return {
      projectId: project.id,
      projectName: project.name ?? "Untitled project",
      signalKind,
      value: 25,
      rawData: activity.body || "Outcome check-in was skipped.",
      confidence: "low",
      recordedAt: activity.created_at,
    };
  }

  if (activity.kind !== "outcome_survey_submitted") return null;

  const numericHints: Record<OutcomeSignalKind, string[]> = {
    timeline_accuracy: ["timeline_accuracy", "timelineScore"],
    budget_accuracy: ["budget_accuracy", "budgetScore", "budget_accuracy_score"],
    scope_drift: ["scope_drift", "scopeScore"],
    client_satisfaction: ["client_satisfaction", "satisfaction", "rating", "nps"],
    delivery_completeness: ["delivery_completeness", "completeness"],
    evidence_quality: ["evidence_quality", "evidence"],
  };

  let rawScore = extractNestedNumber(metadata, numericHints[signalKind]);
  if (signalKind === "client_satisfaction" && rawScore != null && rawScore <= 10) {
    rawScore *= 10;
  }

  if (rawScore == null && signalKind === "client_satisfaction") {
    const body = activity.body?.toLowerCase() ?? "";
    if (body.includes("very satisfied") || body.includes("excellent")) rawScore = 95;
    else if (body.includes("satisfied") || body.includes("great")) rawScore = 85;
    else if (body.includes("neutral") || body.includes("okay")) rawScore = 60;
    else if (body.includes("dissatisfied") || body.includes("frustrated")) rawScore = 35;
  }

  if (rawScore == null) return null;

  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    signalKind,
    value: clampScore(rawScore),
    rawData: activity.body || `Derived from ${activity.kind}.`,
    confidence: activity.kind === "outcome_survey_submitted" ? "medium" : "high",
    recordedAt: activity.created_at,
  };
}

function averageSignal(signals: OutcomeFeedbackSignal[], signalKind: OutcomeSignalKind) {
  const scoped = signals.filter((signal) => signal.signalKind === signalKind);
  if (!scoped.length) return null;
  return clampScore(scoped.reduce((sum, signal) => sum + signal.value, 0) / scoped.length);
}

function buildRecommendation(signalKind: string, avgScore: number) {
  const scoreBand = avgScore >= 80 ? "healthy" : avgScore >= 60 ? "mixed" : "weak";
  const recommendations: Record<string, string> = {
    timeline_accuracy:
      scoreBand === "healthy"
        ? "Keep reusing the current estimating pattern and preserve the assumptions that made timelines predictable."
        : scoreBand === "mixed"
          ? "Tighten estimate assumptions earlier and compare planned durations against completed projects before confirming timelines."
          : "Rebuild the estimating model for delivery timing and require explicit duration assumptions before investment is confirmed.",
    budget_accuracy:
      scoreBand === "healthy"
        ? "Continue using the current pricing baselines as the default reference for new projects."
        : scoreBand === "mixed"
          ? "Review estimate padding, scope-change handling, and any repeated underpriced milestone types."
          : "Audit budget misses by milestone type and add stronger pre-sale cost validation before new projects are approved.",
    scope_drift:
      scoreBand === "healthy"
        ? "The approved roadmap is holding. Keep change control tight."
        : scoreBand === "mixed"
          ? "Watch for milestone creep after approval and force visible proposal reviews sooner."
          : "Scope is drifting too often. Add stronger spine-governance checks before new milestones can be introduced.",
    client_satisfaction:
      scoreBand === "healthy"
        ? "Preserve the delivery behaviors that clients are clearly responding well to."
        : scoreBand === "mixed"
          ? "Review where communication or handoff quality is softening after delivery."
          : "Investigate dissatisfaction patterns immediately and feed the learnings back into intake, expectation-setting, and delivery updates.",
    delivery_completeness:
      scoreBand === "healthy"
        ? "Projects are closing with strong completion discipline."
        : scoreBand === "mixed"
          ? "Audit why milestones are left partial and tighten completion gates."
          : "Too much work is shipping incomplete. Strengthen completion requirements before projects move to delivery.",
    evidence_quality:
      scoreBand === "healthy"
        ? "Evidence quality is strong enough to trust delivery claims."
        : scoreBand === "mixed"
          ? "Raise the minimum proof standard on weaker milestones."
          : "Low evidence quality is undermining confidence. Enforce stronger evidence requirements before milestones can be marked complete.",
  };
  return (
    recommendations[signalKind] ??
    "Review the underlying projects and tighten the upstream operating rule for this pattern."
  );
}

function buildDescription(signalKind: string, avgScore: number) {
  const label = signalKind.replace(/_/g, " ");
  if (avgScore >= 80) return `${label} is consistently strong across the workspace.`;
  if (avgScore >= 60) return `${label} is uneven across projects and needs targeted tightening.`;
  return `${label} is a recurring weakness across delivered work.`;
}

export const getWorkspaceOutcomeFeedbackReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceOutcomeFeedbackReport> => {
    await assertOperatorOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const [projectRes, milestoneRes, activityRes] = await Promise.all([
      supabaseAdmin
        .from("engine_projects")
        .select(
          "id,name,created_at,completed_at,investment_confirmed_at,blueprint,roadmap,investment,delivery",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("engine_milestones")
        .select("project_id,status,estimated_cost_cents,confidence"),
      (supabaseAdmin.from("engine_activity") as unknown as EngineActivitySelect)
        .select("id,project_id,kind,title,body,metadata,created_at")
        .in("kind", [
          "outcome_survey_submitted",
          "outcome_check_in_skipped",
          "outcome_feedback_signal",
          "outcome_pattern_synthesized",
        ]),
    ]);

    if (projectRes.error) throw new Error(projectRes.error.message);
    if (milestoneRes.error) throw new Error(milestoneRes.error.message);
    if (activityRes.error) throw new Error(activityRes.error.message);

    const projects = (projectRes.data ?? []) as ProjectRow[];
    const milestones = (milestoneRes.data ?? []) as MilestoneRow[];
    const activities = (activityRes.data ?? []) as unknown as ActivityRow[];

    const milestonesByProject = new Map<string, MilestoneRow[]>();
    for (const milestone of milestones) {
      const list = milestonesByProject.get(milestone.project_id) ?? [];
      list.push(milestone);
      milestonesByProject.set(milestone.project_id, list);
    }

    const activityByProject = new Map<string, ActivityRow[]>();
    for (const activity of activities) {
      if (!activity.project_id) continue;
      const list = activityByProject.get(activity.project_id) ?? [];
      list.push(activity);
      activityByProject.set(activity.project_id, list);
    }

    const reportSignals: OutcomeFeedbackSignal[] = [];

    for (const project of projects) {
      const projectMilestones = milestonesByProject.get(project.id) ?? [];
      const projectActivities = activityByProject.get(project.id) ?? [];

      const automaticSignals: OutcomeFeedbackSignal[] = [
        buildDeliveryCompletenessSignal(project, projectMilestones),
        buildScopeDriftSignal(project, projectMilestones),
        buildTimelineSignal(project),
        buildEvidenceQualitySignal(project, projectMilestones),
      ];

      const byKind = new Map<OutcomeSignalKind, OutcomeFeedbackSignal>();
      for (const signal of automaticSignals) byKind.set(signal.signalKind, signal);

      for (const signalKind of SIGNAL_KINDS) {
        const latestManual = [...projectActivities]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .map((activity) => parseSurveySignal(project, activity, signalKind))
          .find((signal): signal is OutcomeFeedbackSignal => !!signal);
        if (latestManual) byKind.set(signalKind, latestManual);
      }

      reportSignals.push(...Array.from(byKind.values()));
    }

    reportSignals.sort((a, b) => {
      const dateDelta = Date.parse(b.recordedAt) - Date.parse(a.recordedAt);
      if (dateDelta !== 0) return dateDelta;
      const projectDelta = a.projectName.localeCompare(b.projectName);
      if (projectDelta !== 0) return projectDelta;
      return a.signalKind.localeCompare(b.signalKind);
    });

    const syntheses: OutcomeSynthesis[] = SIGNAL_KINDS.map((signalKind) => {
      const scoped = reportSignals.filter((signal) => signal.signalKind === signalKind);
      const avgScore = scoped.length
        ? clampScore(scoped.reduce((sum, signal) => sum + signal.value, 0) / scoped.length)
        : 0;
      const affectedProjectCount = new Set(scoped.map((signal) => signal.projectId)).size;

      return {
        patternKind: signalKind,
        description: buildDescription(signalKind, avgScore),
        affectedProjectCount,
        avgScore,
        recommendation: buildRecommendation(signalKind, avgScore),
      };
    }).filter((pattern) => pattern.affectedProjectCount > 0);

    syntheses.sort((a, b) => {
      if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
      return b.affectedProjectCount - a.affectedProjectCount;
    });

    return {
      signals: reportSignals,
      syntheses,
      totalProjects: projects.length,
      projectsWithFeedback: new Set(reportSignals.map((signal) => signal.projectId)).size,
      avgTimelineAccuracy: averageSignal(reportSignals, "timeline_accuracy"),
      avgBudgetAccuracy: averageSignal(reportSignals, "budget_accuracy"),
      avgDeliveryCompleteness: averageSignal(reportSignals, "delivery_completeness"),
      topPattern: syntheses[0] ?? null,
      generatedAt: now,
    };
  });

export const recordOutcomeFeedbackSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        signalKind: z.enum(SIGNAL_KINDS),
        value: z.number().min(0).max(100),
        rawData: z.string().trim().min(1).max(4000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (
      supabaseAdmin.from("engine_activity") as unknown as EngineActivitySelect
    ).insert({
      project_id: data.projectId,
      kind: "outcome_feedback_signal",
      title: data.signalKind,
      body: data.rawData,
      metadata: {
        signalKind: data.signalKind,
        value: clampScore(data.value),
        rawData: data.rawData,
      },
    });

    if (error) throw new Error(error.message);
    return { success: true as const };
  });
