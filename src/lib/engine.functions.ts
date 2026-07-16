import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { WorkspaceProject, WorkspaceStepKey } from "@/lib/engine-workspace";
import { WORKSPACE_STEPS } from "@/lib/engine-workspace";
import { aggregateSpineStatus } from "@/lib/spine-truth-status";
import type { SpineFieldStatus } from "@/lib/spine-contract";
import {
  deriveMilestoneGatesFromRecords,
  payloadMatchesMilestone,
  type MilestoneDurableRecords,
  type MilestoneGates,
} from "@/lib/milestone-readiness-evaluator";

const databaseUuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

async function assertAdmin(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!ok) throw new Error("Forbidden: admin role required");
}

export type EngineProjectStatus =
  | "active"
  | "draft"
  | "needs_review"
  | "approved"
  | "delivered"
  | "in_execution"
  | "blocked"
  | "archived";

export type EngineProjectRow = {
  id: string;
  name: string;
  client_id: string;
  client_company: string;
  client_industry: string | null;
  status: EngineProjectStatus;
  current_step: string;
  current_phase: string;
  roadmap_version: string | null;
  approved_version: string | null;
  agent_status: string;
  agent_budget_monthly_cents: number;
  agent_spend_month_cents: number;
  open_decisions: number;
  next_action: string | null;
  last_activity_at: string;
  next_critical_date: { label: string; due_on: string } | null;
  source_count: number;
  latest_source_processed: string | null;
  portal_publish_status: "not_published" | "draft" | "published" | "archived";
  client_portal_project_id: string | null;
};

export type CommandCenterPayload = {
  metrics: {
    active_projects: number;
    new_signals: number;
    sources_processing: number;
    roadmaps_in_progress: number;
    needs_review: number;
    approved: number;
    portal_published: number;
    deliveries_pending: number;
    in_execution: number;
    blocked_decisions: number;
    agent_spend_cents: number;
    agent_budget_cents: number;
    system_health: "green" | "amber" | "red";
  };
  priority_queue: Array<{
    project_id: string;
    project_name: string;
    client_company: string;
    status: EngineProjectStatus;
    next_action: string | null;
    due_on: string | null;
  }>;
  next_best_actions: Array<{
    project_id: string;
    project_name: string;
    client_company: string;
    action: string;
    reason: string;
    due_on: string | null;
  }>;
  active_projects: EngineProjectRow[];
  agent_alerts: Array<{
    id: string;
    title: string;
    body: string | null;
    severity: string;
    created_at: string;
    project_id: string | null;
    project_name: string | null;
  }>;
  upcoming_deadlines: Array<{
    project_id: string;
    project_name: string;
    label: string;
    due_on: string;
  }>;
  review_queue: EngineProjectRow[];
  delivery_queue: EngineProjectRow[];
  execution_queue: EngineProjectRow[];
  stage_breakdown: Array<{
    stage: string;
    count: number;
    projects: Array<{
      id: string;
      name: string;
      client_company: string;
      status: EngineProjectStatus;
    }>;
  }>;
  health_breakdown: {
    on_track: number;
    needs_attention: number;
    at_risk: number;
    blocked: number;
    planning: number;
  };
  sparklines: {
    active_projects: number[];
    needs_attention: number[];
    awaiting_approval: number[];
    at_risk: number[];
    delivery_this_month: number[];
  };
  next_best_actions_v2: Array<{
    project_id: string;
    project_name: string;
    client_company: string;
    action: string;
    reason: string;
    due_on: string | null;
    priority: "high" | "medium" | "low";
    action_type:
      "review" | "send_reminder" | "review_evidence" | "open_intake" | "view_risk" | "advance";
  }>;
  approval_breakdown: {
    total: number;
    by_type: Array<{ type: string; count: number }>;
    items: Array<{
      id: string;
      title: string;
      item_type: string;
      impact: string;
      project_name: string;
      created_at: string;
    }>;
  };
  client_action_counts: {
    decisions_needed: number;
    info_requests: number;
    feedback_pending: number;
  };
  agent_ops: {
    runs_in_progress: number;
    failures_24h: number;
    needs_attention: number;
  };
  delivery_forecast: Array<{
    week: string;
    count: number;
  }>;
  recent_activity: Array<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    severity: string;
    created_at: string;
    project_id: string | null;
    project_name: string | null;
  }>;
};

type ProjectDbRow = {
  id: string;
  name: string;
  client_id: string;
  status: EngineProjectStatus;
  current_step: string;
  roadmap_version: string | null;
  approved_version: string | null;
  agent_status: string;
  agent_budget_monthly_cents: number;
  agent_spend_month_cents: number;
  open_decisions: number;
  next_action: string | null;
  last_activity_at: string;
  client_portal_project_id: string | null;
  engine_clients: { company: string; industry: string | null } | null;
};

type ProjectAggregates = {
  sourceCountByProject: Map<string, number>;
  sourcesProcessing: number;
  latestProcessedByProject: Map<string, string>;
  portalStatusByProject: Map<string, "not_published" | "draft" | "published" | "archived">;
  portalPublishedCount: number;
  systemHealth: "green" | "amber" | "red";
};

// Human-friendly phase label derived from the internal step key. Keeps the
// projects list readable without adding a new column to engine_projects.
const STEP_TO_PHASE: Record<string, string> = {
  intelligence: "Discovery",
  signal_room: "Discovery",
  extraction: "Discovery",
  point_a: "Diagnosis",
  point_b: "Diagnosis",
  hidden_assets: "Diagnosis",
  gap_map: "Diagnosis",
  blueprint: "Roadmap",
  roadmap_drafting: "Roadmap",
  builder: "Roadmap",
  sequencing: "Roadmap",
  deadlines: "Roadmap",
  investment: "Roadmap",
  preview: "Delivery",
  delivery: "Delivery",
};

function phaseFromStep(step: string): string {
  return STEP_TO_PHASE[step] ?? step.replace(/_/g, " ");
}

function mapRow(
  r: ProjectDbRow,
  dateByProject: Map<string, { label: string; due_on: string }>,
  agg: ProjectAggregates,
): EngineProjectRow {
  return {
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    client_company: r.engine_clients?.company ?? "—",
    client_industry: r.engine_clients?.industry ?? null,
    status: r.status,
    current_step: r.current_step,
    current_phase: phaseFromStep(r.current_step),
    roadmap_version: r.roadmap_version,
    approved_version: r.approved_version,
    agent_status: r.agent_status,
    agent_budget_monthly_cents: r.agent_budget_monthly_cents,
    agent_spend_month_cents: r.agent_spend_month_cents,
    open_decisions: r.open_decisions,
    next_action: r.next_action,
    last_activity_at: r.last_activity_at,
    next_critical_date: dateByProject.get(r.id) ?? null,
    source_count: agg.sourceCountByProject.get(r.id) ?? 0,
    latest_source_processed: agg.latestProcessedByProject.get(r.id) ?? null,
    portal_publish_status: r.client_portal_project_id
      ? (agg.portalStatusByProject.get(r.client_portal_project_id) ?? "not_published")
      : "not_published",
    client_portal_project_id: r.client_portal_project_id,
  };
}

const COMMAND_CENTER_STAGE_ORDER = [
  "Discovery",
  "Diagnosis",
  "Roadmap",
  "Delivery",
  "Execution",
] as const;

const COMMAND_CENTER_STATUS_SORT_WEIGHT: Partial<Record<EngineProjectStatus, number>> = {
  blocked: 5,
  needs_review: 4,
  active: 3,
  in_execution: 2,
  draft: 1,
};

function dueSortValue(project: EngineProjectRow) {
  return project.next_critical_date?.due_on ?? "9999-12-31";
}

function isDueWithinDays(iso: string | null | undefined, days: number, now: number) {
  if (!iso) return false;
  const delta = new Date(iso).getTime() - now;
  if (Number.isNaN(delta)) return false;
  return delta >= 0 && delta <= days * 24 * 3600 * 1000;
}

function makeSyntheticSparkline(currentValue: number) {
  return Array.from({ length: 7 }, (_, dayIndex) =>
    Math.max(0, currentValue + Math.round(Math.sin(dayIndex) * currentValue * 0.15)),
  );
}

async function fetchProjects(supabase: {
  from: (t: string) => {
    select: (s: string) => {
      order: (
        col: string,
        o?: { ascending?: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}): Promise<{
  rows: ProjectDbRow[];
  dates: Map<string, { label: string; due_on: string }>;
  agg: ProjectAggregates;
}> {
  const { data, error } = await supabase
    .from("engine_projects")
    .select(
      "id,name,client_id,status,current_step,roadmap_version,approved_version,agent_status,agent_budget_monthly_cents,agent_spend_month_cents,open_decisions,next_action,last_activity_at,client_portal_project_id, engine_clients(company,industry)",
    )
    .order("last_activity_at", { ascending: false });
  if (error) throw new Error((error as { message?: string }).message ?? "load projects failed");
  const rows = (data ?? []) as ProjectDbRow[];

  const { data: dateData } = await supabase
    .from("engine_project_dates")
    .select("project_id,label,due_on")
    .order("due_on", { ascending: true });
  const dates = new Map<string, { label: string; due_on: string }>();
  for (const d of (dateData ?? []) as Array<{
    project_id: string;
    label: string;
    due_on: string;
  }>) {
    if (!dates.has(d.project_id)) dates.set(d.project_id, { label: d.label, due_on: d.due_on });
  }

  // Source aggregates (count per project, latest processed timestamp, and
  // in-flight extraction count for the Command Center metric).
  const sourceCountByProject = new Map<string, number>();
  const latestProcessedByProject = new Map<string, string>();
  let sourcesProcessing = 0;
  const { data: srcData } = await supabase
    .from("engine_sources")
    .select("project_id,status,updated_at")
    .order("updated_at", { ascending: false });
  for (const s of (srcData ?? []) as Array<{
    project_id: string;
    status: string;
    updated_at: string;
  }>) {
    sourceCountByProject.set(s.project_id, (sourceCountByProject.get(s.project_id) ?? 0) + 1);
    if (s.status === "processed" && !latestProcessedByProject.has(s.project_id)) {
      latestProcessedByProject.set(s.project_id, s.updated_at);
    }
    if (s.status === "queued" || s.status === "processing") sourcesProcessing += 1;
  }

  // Portal publish status per portal project (rows already ordered newest first).
  const portalStatusByProject = new Map<
    string,
    "not_published" | "draft" | "published" | "archived"
  >();
  const { data: portalData } = await supabase
    .from("client_portal_roadmaps")
    .select("project_id,status,updated_at")
    .order("updated_at", { ascending: false });
  for (const p of (portalData ?? []) as Array<{ project_id: string; status: string }>) {
    if (portalStatusByProject.has(p.project_id)) continue;
    const s = (p.status ?? "").toLowerCase();
    const mapped: "not_published" | "draft" | "published" | "archived" =
      s === "published" || s === "client_facing"
        ? "published"
        : s === "archived"
          ? "archived"
          : "draft";
    portalStatusByProject.set(p.project_id, mapped);
  }
  const portalPublishedCount = Array.from(portalStatusByProject.values()).filter(
    (v) => v === "published",
  ).length;

  // System health: red if any extraction failed in the last 24h or any
  // agent alert with severity error; amber for warnings; else green.
  let systemHealth: "green" | "amber" | "red" = "green";
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: failedSrc } = await supabase
    .from("engine_sources")
    .select("id,status,updated_at")
    .order("updated_at", { ascending: false });
  for (const s of (failedSrc ?? []) as Array<{ status: string; updated_at: string }>) {
    if (s.status === "failed" && s.updated_at >= dayAgo) {
      systemHealth = "red";
      break;
    }
  }
  if (systemHealth === "green") {
    const { data: sev } = await supabase
      .from("engine_activity")
      .select("severity,created_at")
      .order("created_at", { ascending: false });
    for (const a of ((sev ?? []) as Array<{ severity: string; created_at: string }>).slice(0, 25)) {
      if (a.severity === "error") {
        systemHealth = "red";
        break;
      }
      if (a.severity === "warning" || a.severity === "warn") systemHealth = "amber";
    }
  }

  return {
    rows,
    dates,
    agg: {
      sourceCountByProject,
      sourcesProcessing,
      latestProcessedByProject,
      portalStatusByProject,
      portalPublishedCount,
      systemHealth,
    },
  };
}

export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommandCenterPayload> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { rows, dates, agg } = await fetchProjects(context.supabase as never);
    const projects = rows.map((r) => mapRow(r, dates, agg));

    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const nextMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1,
    ).toISOString();
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const twoHoursAgo = new Date(now - 2 * 3600 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Signals this month
    const { count: signalCount } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (
            s: string,
            o: { count: "exact"; head: true },
          ) => {
            gte: (c: string, v: string) => Promise<{ count: number | null }>;
          };
        };
      }
    )
      .from("engine_signals")
      .select("id", { count: "exact", head: true })
      .gte("received_at", monthStart);

    const { data: alertData } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => { limit: (n: number) => Promise<{ data: unknown }> };
          };
        };
      }
    )
      .from("engine_activity")
      .select("id,title,body,severity,created_at,project_id, engine_projects(name)")
      .order("created_at", { ascending: false })
      .limit(6);

    const alerts = (
      (alertData ?? []) as Array<{
        id: string;
        title: string;
        body: string | null;
        severity: string;
        created_at: string;
        project_id: string | null;
        engine_projects: { name: string } | null;
      }>
    ).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      severity: a.severity,
      created_at: a.created_at,
      project_id: a.project_id,
      project_name: a.engine_projects?.name ?? null,
    }));

    const upcoming = projects
      .filter((p) => p.next_critical_date)
      .map((p) => ({
        project_id: p.id,
        project_name: p.name,
        label: p.next_critical_date!.label,
        due_on: p.next_critical_date!.due_on,
      }))
      .filter((d) => new Date(d.due_on).getTime() >= now - 24 * 3600 * 1000)
      .sort((a, b) => a.due_on.localeCompare(b.due_on))
      .slice(0, 6);

    const metrics = {
      active_projects: projects.filter((p) => p.status === "active").length,
      new_signals: signalCount ?? 0,
      sources_processing: agg.sourcesProcessing,
      roadmaps_in_progress: projects.filter(
        (p) => p.status === "draft" || p.current_step === "roadmap_drafting",
      ).length,
      needs_review: projects.filter((p) => p.status === "needs_review").length,
      approved: projects.filter((p) => p.status === "approved").length,
      portal_published: agg.portalPublishedCount,
      deliveries_pending: projects.filter((p) => p.status === "delivered").length,
      in_execution: projects.filter((p) => p.status === "in_execution").length,
      blocked_decisions: projects.filter((p) => p.status === "blocked").length,
      agent_spend_cents: projects.reduce((s, p) => s + p.agent_spend_month_cents, 0),
      agent_budget_cents: projects.reduce((s, p) => s + p.agent_budget_monthly_cents, 0),
      system_health: agg.systemHealth,
    };

    const priority = projects
      .filter((p) => p.next_action)
      .sort((a, b) => {
        const ad = a.next_critical_date?.due_on ?? "9999-12-31";
        const bd = b.next_critical_date?.due_on ?? "9999-12-31";
        return ad.localeCompare(bd);
      })
      .slice(0, 10)
      .map((p) => ({
        project_id: p.id,
        project_name: p.name,
        client_company: p.client_company,
        status: p.status,
        next_action: p.next_action,
        due_on: p.next_critical_date?.due_on ?? null,
      }));

    // Next Best Actions — ranked by status urgency + deadline. Purely
    // derived so operators see one aggregate to-do list across the portfolio.
    const STATUS_WEIGHT: Partial<Record<EngineProjectStatus, number>> = {
      blocked: 100,
      needs_review: 80,
      approved: 60,
      delivered: 40,
      in_execution: 20,
      active: 10,
      draft: 5,
    };
    const REASON: Partial<Record<EngineProjectStatus, string>> = {
      blocked: "Blocked on a client decision — unblock or reassign.",
      needs_review: "Draft is waiting on operator review.",
      approved: "Approved — publish to the client portal.",
      delivered: "Delivered — chase acknowledgement and move to execution.",
      in_execution: "Execution in flight — check for blocked tasks.",
      active: "Keep momentum on the current step.",
      draft: "Draft in progress — send to review when ready.",
    };
    const nextBestActions = projects
      .filter((p) => p.next_action || STATUS_WEIGHT[p.status])
      .map((p) => ({
        project_id: p.id,
        project_name: p.name,
        client_company: p.client_company,
        action: p.next_action ?? `Advance ${p.name}`,
        reason: REASON[p.status] ?? "Follow up on next step.",
        due_on: p.next_critical_date?.due_on ?? null,
        _rank:
          (STATUS_WEIGHT[p.status] ?? 0) +
          (p.next_critical_date
            ? Math.max(
                0,
                40 -
                  Math.floor(
                    (new Date(p.next_critical_date.due_on).getTime() - now) / (24 * 3600 * 1000),
                  ),
              )
            : 0),
      }))
      .sort((a, b) => b._rank - a._rank)
      .slice(0, 6)
      .map(({ _rank: _r, ...rest }) => rest);

    const stage_breakdown = COMMAND_CENTER_STAGE_ORDER.map((stage) => {
      const stageProjects = projects
        .filter((project) => project.current_phase === stage)
        .sort((a, b) => {
          const dueCompare = dueSortValue(a).localeCompare(dueSortValue(b));
          if (dueCompare !== 0) return dueCompare;
          return (
            (COMMAND_CENTER_STATUS_SORT_WEIGHT[b.status] ?? 0) -
            (COMMAND_CENTER_STATUS_SORT_WEIGHT[a.status] ?? 0)
          );
        });

      return {
        stage,
        count: stageProjects.length,
        projects: stageProjects.slice(0, 4).map((project) => ({
          id: project.id,
          name: project.name,
          client_company: project.client_company,
          status: project.status,
        })),
      };
    });

    const health_breakdown = projects.reduce(
      (acc, project) => {
        const statusValue = project.status as string;
        const atRisk =
          isDueWithinDays(project.next_critical_date?.due_on, 7, now) &&
          statusValue !== "completed";
        if (project.status === "blocked") acc.blocked += 1;
        if (project.status === "needs_review") acc.needs_attention += 1;
        if (atRisk) acc.at_risk += 1;
        if (project.status === "draft") acc.planning += 1;
        if (
          ["active", "in_execution", "approved"].includes(project.status) &&
          !atRisk &&
          project.status !== "blocked"
        ) {
          acc.on_track += 1;
        }
        return acc;
      },
      {
        on_track: 0,
        needs_attention: 0,
        at_risk: 0,
        blocked: 0,
        planning: 0,
      },
    );

    const { data: approvalRows } = await sb
      .from("engine_review_items")
      .select("id,title,item_type,impact,created_at,project_id, engine_projects(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const approvalItemsRaw = (approvalRows ?? []) as Array<{
      id: string;
      title: string | null;
      item_type: string | null;
      impact: string | null;
      created_at: string;
      project_id: string | null;
      engine_projects: { name: string } | null;
    }>;
    const approval_breakdown = {
      total: approvalItemsRaw.length,
      by_type: Array.from(
        approvalItemsRaw.reduce((map, item) => {
          const type = item.item_type?.trim() || "other";
          map.set(type, (map.get(type) ?? 0) + 1);
          return map;
        }, new Map<string, number>()),
      )
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      items: approvalItemsRaw.slice(0, 5).map((item) => ({
        id: item.id,
        title: item.title?.trim() || "Untitled review item",
        item_type: item.item_type?.trim() || "other",
        impact: item.impact?.trim() || "Standard review item",
        project_name: item.engine_projects?.name ?? "—",
        created_at: item.created_at,
      })),
    };

    const { data: pendingClientTasks } = await sb
      .from("engine_tasks")
      .select("id")
      .eq("status", "pending")
      .is("owner_email", null)
      .limit(50);

    const client_action_counts = {
      decisions_needed: projects.filter((project) => project.open_decisions > 0).length,
      info_requests: ((pendingClientTasks ?? []) as Array<{ id: string }>).length,
      feedback_pending: projects.filter((project) => project.status === "delivered").length,
    };

    const { data: agentRunRows } = await sb
      .from("engine_project_openclaw_runs")
      .select("status,created_at");
    const agent_ops = (
      (agentRunRows ?? []) as Array<{
        status: string;
        created_at: string;
      }>
    ).reduce(
      (acc, run) => {
        if (run.status === "running") acc.runs_in_progress += 1;
        if (run.status === "failed" && run.created_at >= dayAgo) acc.failures_24h += 1;
        if (run.status === "failed" || (run.status === "running" && run.created_at < twoHoursAgo)) {
          acc.needs_attention += 1;
        }
        return acc;
      },
      { runs_in_progress: 0, failures_24h: 0, needs_attention: 0 },
    );

    const { data: forecastRows } = await sb
      .from("engine_project_dates")
      .select("due_on")
      .gte("due_on", monthStart)
      .lt("due_on", nextMonthStart)
      .order("due_on", { ascending: true });
    const deliveryForecastMap = new Map<string, number>(
      ["W1", "W2", "W3", "W4", "W5"].map((week) => [week, 0]),
    );
    for (const row of (forecastRows ?? []) as Array<{ due_on: string }>) {
      const date = new Date(row.due_on);
      if (Number.isNaN(date.getTime())) continue;
      const week = `W${Math.min(5, Math.floor((date.getDate() - 1) / 7) + 1)}`;
      deliveryForecastMap.set(week, (deliveryForecastMap.get(week) ?? 0) + 1);
    }
    const delivery_forecast = Array.from(deliveryForecastMap, ([week, count]) => ({
      week,
      count,
    }));

    const { data: recentActivityRows } = await sb
      .from("engine_activity")
      .select("id,kind,title,body,severity,created_at,project_id, engine_projects(name)")
      .order("created_at", { ascending: false })
      .limit(10);
    const recent_activity = (
      (recentActivityRows ?? []) as Array<{
        id: string;
        kind: string | null;
        title: string;
        body: string | null;
        severity: string | null;
        created_at: string;
        project_id: string | null;
        engine_projects: { name: string } | null;
      }>
    ).map((activity) => ({
      id: activity.id,
      kind: activity.kind ?? "activity",
      title: activity.title,
      body: activity.body,
      severity: activity.severity ?? "info",
      created_at: activity.created_at,
      project_id: activity.project_id,
      project_name: activity.engine_projects?.name ?? null,
    }));

    const sparklines = {
      active_projects: makeSyntheticSparkline(metrics.active_projects),
      needs_attention: makeSyntheticSparkline(metrics.needs_review),
      awaiting_approval: makeSyntheticSparkline(approval_breakdown.total),
      at_risk: makeSyntheticSparkline(health_breakdown.at_risk),
      delivery_this_month: makeSyntheticSparkline(metrics.deliveries_pending),
    };

    const next_best_actions_v2 = nextBestActions.map((action) => {
      const project = projects.find((candidate) => candidate.id === action.project_id);
      const nearDeadline = isDueWithinDays(action.due_on, 7, now);
      const priority: "high" | "medium" | "low" =
        project?.status === "blocked" || project?.status === "needs_review"
          ? "high"
          : project?.status === "active" && nearDeadline
            ? "medium"
            : "low";

      const action_type:
        "review" | "send_reminder" | "review_evidence" | "open_intake" | "view_risk" | "advance" =
        project?.status === "blocked"
          ? "view_risk"
          : project?.status === "needs_review"
            ? "review"
            : project?.status === "approved"
              ? "send_reminder"
              : project?.status === "delivered"
                ? "review_evidence"
                : project?.status === "draft"
                  ? "open_intake"
                  : "advance";

      return {
        ...action,
        priority,
        action_type,
      };
    });

    return {
      metrics,
      priority_queue: priority,
      next_best_actions: nextBestActions,
      active_projects: projects.filter((p) => p.status === "active").slice(0, 6),
      agent_alerts: alerts,
      upcoming_deadlines: upcoming,
      review_queue: projects.filter((p) => p.status === "needs_review").slice(0, 5),
      delivery_queue: projects.filter((p) => p.status === "delivered").slice(0, 5),
      execution_queue: projects.filter((p) => p.status === "in_execution").slice(0, 5),
      stage_breakdown,
      health_breakdown,
      sparklines,
      next_best_actions_v2,
      approval_breakdown,
      client_action_counts,
      agent_ops,
      delivery_forecast,
      recent_activity,
    };
  });

const ListInput = z.object({
  filter: z
    .enum([
      "all",
      "active",
      "needs_review",
      "draft",
      "approved",
      "delivered",
      "in_execution",
      "blocked",
      "archived",
    ])
    .default("all"),
  q: z.string().trim().default(""),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw ?? {}))
  .handler(async ({ context, data }): Promise<{ rows: EngineProjectRow[] }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { rows, dates, agg } = await fetchProjects(context.supabase as never);
    let out = rows.map((r) => mapRow(r, dates, agg));
    if (data.filter !== "all") out = out.filter((r) => r.status === data.filter);
    if (data.q) {
      const q = data.q.toLowerCase();
      out = out.filter(
        (r) => r.name.toLowerCase().includes(q) || r.client_company.toLowerCase().includes(q),
      );
    }
    return { rows: out };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data: p, error } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      }
    )
      .from("engine_projects")
      .select(
        "id,name,client_id,status,current_step,roadmap_version,approved_version,agent_status,agent_budget_monthly_cents,agent_spend_month_cents,open_decisions,next_action,last_activity_at, engine_clients(company,industry,owner_email,primary_contact,notes)",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "not found");
    const project = p as {
      id: string;
      name: string;
      client_id: string;
      status: EngineProjectStatus;
      current_step: string;
      roadmap_version: string | null;
      approved_version: string | null;
      agent_status: string;
      agent_budget_monthly_cents: number;
      agent_spend_month_cents: number;
      open_decisions: number;
      next_action: string | null;
      last_activity_at: string;
      engine_clients: {
        company: string;
        industry: string | null;
        owner_email: string | null;
        primary_contact: string | null;
        notes: string | null;
      } | null;
    };

    const { data: datesData } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }>;
            };
          };
        };
      }
    )
      .from("engine_project_dates")
      .select("id,label,due_on,kind")
      .eq("project_id", data.id)
      .order("due_on", { ascending: true });

    const { data: signalData } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: unknown }>;
              };
            };
          };
        };
      }
    )
      .from("engine_signals")
      .select("id,source,summary,received_at,triaged")
      .eq("project_id", data.id)
      .order("received_at", { ascending: false })
      .limit(10);

    const { data: actData } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: unknown }>;
              };
            };
          };
        };
      }
    )
      .from("engine_activity")
      .select("id,kind,title,body,severity,created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      project,
      dates: (datesData ?? []) as Array<{
        id: string;
        label: string;
        due_on: string;
        kind: string;
      }>,
      signals: (signalData ?? []) as Array<{
        id: string;
        source: string | null;
        summary: string;
        received_at: string;
        triaged: boolean;
      }>,
      activity: (actData ?? []) as Array<{
        id: string;
        kind: string;
        title: string;
        body: string | null;
        severity: string;
        created_at: string;
      }>,
    };
  });

const WORKSPACE_SELECT =
  "id,name,status,current_step_num,progress_pct,health_score,roadmap_version,approved_version,agent_status,agent_budget_monthly_cents,agent_spend_month_cents,open_decisions,next_action,last_activity_at,updated_at,step_states,signal_room,extraction,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview,delivery, engine_clients(company,owner_email)";

export const getProjectWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: databaseUuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      project: WorkspaceProject;
      dates: Array<{ id: string; label: string; due_on: string; kind: string }>;
      activity: Array<{
        id: string;
        kind: string;
        title: string;
        body: string | null;
        severity: string;
        created_at: string;
      }>;
    }> => {
      await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
      const sb = context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: unknown }>;
              } & Promise<{ data: unknown }>;
            };
          };
        };
      };
      const { data: p, error } = await sb
        .from("engine_projects")
        .select(WORKSPACE_SELECT)
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error((error as { message?: string }).message ?? "not found");
      if (!p) throw new Error(`Project not found: ${data.id}`);
      const row = p as Record<string, unknown> & {
        engine_clients: { company: string; owner_email: string | null } | null;
      };

      const { data: datesData } = await sb
        .from("engine_project_dates")
        .select("id,label,due_on,kind")
        .eq("project_id", data.id)
        .order("due_on", { ascending: true });
      const { data: actData } = await sb
        .from("engine_activity")
        .select("id,kind,title,body,severity,created_at")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20);

      // Extracted signals count (display metric on workspace header)
      const signalCountResp = await (
        context.supabase as unknown as {
          from: (t: string) => {
            select: (
              s: string,
              opts: { count: "exact"; head: true },
            ) => {
              eq: (c: string, v: string) => Promise<{ count: number | null }>;
            };
          };
        }
      )
        .from("engine_extracted_signals")
        .select("id", { count: "exact", head: true })
        .eq("project_id", data.id);
      const signal_count = signalCountResp.count ?? 0;

      const step_states =
        (row.step_states as Record<string, import("@/lib/engine-workspace").StepState>) ?? {};
      const hasKeys = (v: unknown) =>
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v as Record<string, unknown>).length > 0;

      // Fallback health score when the stored value is 0 / unset.
      const storedHealth = (row.health_score as number) ?? 0;
      let computedHealth = 0;
      computedHealth += Math.min(40, Math.round((signal_count / 20) * 40));
      if (row.roadmap_version) computedHealth += 20;
      if (hasKeys(row.point_a) || hasKeys(row.point_b)) computedHealth += 15;
      if (row.approved_version) computedHealth += 15;
      if (hasKeys(row.delivery)) computedHealth += 10;
      computedHealth = Math.max(0, Math.min(100, computedHealth));
      const health_score = storedHealth > 0 ? storedHealth : computedHealth;

      // Fallback progress % from touched step states (any recorded state counts).
      const storedProgress = (row.progress_pct as number) ?? 0;
      const hasRoadmapDraft = !!row.roadmap_version || hasKeys(row.roadmap);
      const hasApproved = !!row.approved_version;
      const artifactHasData: Record<WorkspaceStepKey, boolean> = {
        intelligence: signal_count > 0,
        "signal-room": signal_count > 0 || hasKeys(row.signal_room),
        extraction: signal_count > 0 || hasKeys(row.extraction),
        "point-a": hasKeys(row.point_a),
        "point-b": hasKeys(row.point_b),
        "hidden-assets": hasKeys(row.hidden_assets),
        "gap-map": hasKeys(row.gap_map),
        blueprint: hasKeys(row.blueprint),
        builder: hasRoadmapDraft,
        sequencing: hasKeys(row.sequencing) || hasApproved,
        deadlines: hasKeys(row.deadlines) || hasApproved,
        investment: hasKeys(row.investment) || hasApproved,
        preview: hasKeys(row.client_preview) || hasApproved,
        delivery: hasKeys(row.delivery),
      };
      const stepsActive = WORKSPACE_STEPS.filter(
        ({ key }) => !!step_states[key]?.state || artifactHasData[key as WorkspaceStepKey],
      ).length;
      const computedProgress = Math.round((stepsActive / 14) * 100);
      const progress_pct = storedProgress > 0 ? storedProgress : computedProgress;

      const project: WorkspaceProject = {
        id: row.id as string,
        name: row.name as string,
        status: row.status as string,
        current_step_num: (row.current_step_num as number) ?? 1,
        progress_pct,
        health_score,
        roadmap_version: (row.roadmap_version as string | null) ?? null,
        approved_version: (row.approved_version as string | null) ?? null,
        agent_status: (row.agent_status as string) ?? "idle",
        agent_budget_monthly_cents: (row.agent_budget_monthly_cents as number) ?? 0,
        agent_spend_month_cents: (row.agent_spend_month_cents as number) ?? 0,
        open_decisions: (row.open_decisions as number) ?? 0,
        signal_count,
        next_action: (row.next_action as string | null) ?? null,
        last_activity_at: row.last_activity_at as string,
        updated_at: row.updated_at as string,
        client_company: row.engine_clients?.company ?? "—",
        client_owner_email: row.engine_clients?.owner_email ?? null,
        step_states,

        signal_room: (row.signal_room as import("@/lib/engine-workspace").Json) ?? {},
        extraction: (row.extraction as import("@/lib/engine-workspace").Json) ?? {},
        point_a: (row.point_a as import("@/lib/engine-workspace").Json) ?? {},
        point_b: (row.point_b as import("@/lib/engine-workspace").Json) ?? {},
        hidden_assets: (row.hidden_assets as import("@/lib/engine-workspace").Json) ?? {},
        gap_map: (row.gap_map as import("@/lib/engine-workspace").Json) ?? {},
        blueprint: (row.blueprint as import("@/lib/engine-workspace").Json) ?? {},
        roadmap: (row.roadmap as import("@/lib/engine-workspace").Json) ?? {},
        sequencing: (row.sequencing as import("@/lib/engine-workspace").Json) ?? {},
        deadlines: (row.deadlines as import("@/lib/engine-workspace").Json) ?? {},
        investment: (row.investment as import("@/lib/engine-workspace").Json) ?? {},
        client_preview: (row.client_preview as import("@/lib/engine-workspace").Json) ?? {},
        delivery: (row.delivery as import("@/lib/engine-workspace").Json) ?? {},
      };

      return {
        project,
        dates: (datesData ?? []) as Array<{
          id: string;
          label: string;
          due_on: string;
          kind: string;
        }>,
        activity: (actData ?? []) as Array<{
          id: string;
          kind: string;
          title: string;
          body: string | null;
          severity: string;
          created_at: string;
        }>,
      };
    },
  );

const STEP_COLUMNS: Record<WorkspaceStepKey, string | null> = {
  intelligence: null,
  "signal-room": "signal_room",
  extraction: "extraction",
  "point-a": "point_a",
  "point-b": "point_b",
  "hidden-assets": "hidden_assets",
  "gap-map": "gap_map",
  blueprint: "blueprint",
  builder: "roadmap",
  sequencing: "sequencing",
  deadlines: "deadlines",
  investment: "investment",
  preview: "client_preview",
  delivery: "delivery",
};

const UpdateStepInput = z.object({
  id: z.string().uuid(),
  step: z.enum([
    "signal-room",
    "extraction",
    "point-a",
    "point-b",
    "hidden-assets",
    "gap-map",
    "blueprint",
    "builder",
    "sequencing",
    "deadlines",
    "investment",
    "preview",
    "delivery",
  ]),
  data: z.record(z.string(), z.unknown()),
  // Optimistic-lock guard. When present, the update fails if another writer
  // has changed the project since the caller loaded it. Client passes the
  // `updated_at` seen at edit time.
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  // Phase 4B: optional reason string for spine field changes (point-a / point-b).
  // When present, it's recorded on each engine_audit_log row written for the change.
  reason: z.string().trim().max(500).optional(),
});

export const updateProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateStepInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const col = STEP_COLUMNS[data.step as WorkspaceStepKey];
    if (!col) throw new Error("Unknown step");
    const email = (context as unknown as { claims?: { email?: string } }).claims?.email ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Read current step_states + updated_at so we can merge state and detect
    // concurrent writes. For spine steps (point-a / point-b) also read the
    // current column value so we can diff and write field-level audit rows.
    const isSpineStep = data.step === "point-a" || data.step === "point-b";
    const selectCols = isSpineStep
      ? `step_states, updated_at, ${col}`
      : "step_states, updated_at";
    const { data: cur } = await sb
      .from("engine_projects")
      .select(selectCols)
      .eq("id", data.id)
      .single();
    const states = (cur?.step_states ?? {}) as Record<
      string,
      import("@/lib/engine-workspace").StepState
    >;
    const previousSpineValue: Record<string, unknown> | null = isSpineStep
      ? ((cur?.[col] as Record<string, unknown> | null) ?? null)
      : null;
    const currentUpdatedAt = (cur?.updated_at as string | null) ?? null;

    // Optimistic lock: bail out early with a clear error if the row moved
    // under the caller. Client can re-open the editor with fresh data.
    if (
      data.expectedUpdatedAt &&
      currentUpdatedAt &&
      new Date(data.expectedUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime()
    ) {
      throw new Error(
        "This project changed while you were editing. Reload to see the latest and try again.",
      );
    }

    // Pillar 6: protect operator-approved diagnostic modules from silent
    // re-writes. Point A / Point B once approved represent Tai's signed-off
    // diagnosis + destination; overwriting them from the workspace should
    // require a fresh state transition (approved → draft via setStepState).
    const PROTECTED_APPROVED_STEPS = new Set<WorkspaceStepKey>(["point-a", "point-b"]);
    if (
      PROTECTED_APPROVED_STEPS.has(data.step as WorkspaceStepKey) &&
      states[data.step]?.state === "approved"
    ) {
      throw new Error(
        `Cannot overwrite approved "${data.step}" content. Reset the step to draft before editing.`,
      );
    }

    states[data.step] = {
      state: "draft",
      updated_at: new Date().toISOString(),
      updated_by: email,
      note: states[data.step]?.note ?? null,
    };

    // Second-layer guard: include updated_at in the WHERE so an inter-handler
    // race still fails atomically at the DB (returns 0 rows updated).
    let updateQuery = sb
      .from("engine_projects")
      .update({ [col]: data.data, step_states: states })
      .eq("id", data.id);
    if (data.expectedUpdatedAt && currentUpdatedAt) {
      updateQuery = updateQuery.eq("updated_at", currentUpdatedAt);
    }
    const { error, count } = await updateQuery.select("id", { count: "exact" });
    if (error) throw new Error((error as { message?: string }).message ?? "update failed");
    if (data.expectedUpdatedAt && (count ?? 0) === 0) {
      throw new Error(
        "This project changed while you were editing. Reload to see the latest and try again.",
      );
    }

    // High-impact steps get an audit row: investment shifts and client-preview
    // publish must both be traceable back to the human who signed off.
    const HIGH_IMPACT: Record<string, string> = {
      investment: "investment_updated",
      preview: "client_preview_updated",
      delivery: "delivery_details_updated",
    };
    const action = HIGH_IMPACT[data.step];
    if (action) {
      await sb.from("engine_audit_log").insert({
        project_id: data.id,
        actor_email: email,
        action,
        summary: `Updated ${data.step.replace(/-/g, " ")} (human edit).`,
        affected_modules: [col],
        metadata: { step: data.step, keys: Object.keys(data.data ?? {}) },
      });
    }

    // Phase 4B: spine (point-a / point-b) changes get one field-level audit
    // row per changed top-level key so operators get diff + reason history.
    if (isSpineStep) {
      const prev = (previousSpineValue ?? {}) as Record<string, unknown>;
      const next = (data.data ?? {}) as Record<string, unknown>;
      const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
      const changed = keys.filter(
        (k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null),
      );
      if (changed.length) {
        const rows = changed.map((key) => ({
          project_id: data.id,
          actor_email: email,
          action: "spine_field_changed",
          summary: `Updated ${data.step} · ${key}`,
          affected_modules: ["spine", col],
          field_changed: `${col}.${key}`,
          old_value: (prev[key] ?? null) as unknown,
          new_value: (next[key] ?? null) as unknown,
          reason: data.reason ?? null,
          metadata: { step: data.step, spine_field: key },
        }));
        await sb.from("engine_audit_log").insert(rows);
        await sb.from("engine_activity").insert({
          project_id: data.id,
          kind: "spine_field_changed",
          title: `${data.step} updated (${changed.length} field${changed.length === 1 ? "" : "s"})`,
          body: email ? `By ${email}${data.reason ? ` — ${data.reason}` : ""}` : null,
          severity: "info",
        });
      }
    }

    return { ok: true };
  });

/* ------------------------------------------------------------------
 * P2-8: Per-step state machine
 * ---------------------------------------------------------------- */

const SetStepStateInput = z.object({
  id: z.string().uuid(),
  step: z.enum([
    "signal-room",
    "extraction",
    "point-a",
    "point-b",
    "hidden-assets",
    "gap-map",
    "blueprint",
    "builder",
    "sequencing",
    "deadlines",
    "investment",
    "preview",
    "delivery",
  ]),
  state: z.enum(["draft", "review", "approved"]),
  note: z.string().max(500).nullable().optional(),
});

export const setStepState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SetStepStateInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const email = (context as unknown as { claims?: { email?: string } }).claims?.email ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: cur } = await sb
      .from("engine_projects")
      .select("step_states")
      .eq("id", data.id)
      .single();
    const states = (cur?.step_states ?? {}) as Record<
      string,
      import("@/lib/engine-workspace").StepState
    >;
    const prev = states[data.step]?.state ?? null;
    states[data.step] = {
      state: data.state,
      updated_at: new Date().toISOString(),
      updated_by: email,
      note: data.note ?? null,
    };
    const { error } = await sb
      .from("engine_projects")
      .update({ step_states: states })
      .eq("id", data.id);
    if (error) throw new Error((error as { message?: string }).message ?? "state update failed");

    await sb.from("engine_audit_log").insert({
      project_id: data.id,
      actor_email: email,
      action: "step_state_changed",
      summary: `Step "${data.step}" ${prev ?? "unset"} → ${data.state}`,
      field_changed: `step_states.${data.step}.state`,
      old_value: prev,
      new_value: data.state,
      reason: data.note ?? null,
      metadata: { step: data.step },
    });
    await sb.from("engine_activity").insert({
      project_id: data.id,
      kind: "step_state_changed",
      title: `${data.step} → ${data.state}`,
      body: email ? `By ${email}` : null,
      severity: "info",
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------
 * P2-8: Source evidence per step — reads extracted signals by category
 * ---------------------------------------------------------------- */

export type StepEvidence = {
  id: string;
  category: string;
  label: string;
  detail: string | null;
  confidence: number;
  source_id: string | null;
  source_name: string | null;
  created_at: string;
};

export const listStepEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        categories: z.array(z.string()).max(20).default([]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<StepEvidence[]> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    let q = sb
      .from("engine_extracted_signals")
      .select("id,category,label,detail,confidence,source_id,created_at, engine_sources(name)")
      .eq("project_id", data.id)
      .order("confidence", { ascending: false })
      .limit(50);
    if (data.categories.length) q = q.in("category", data.categories);
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "evidence fetch failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      category: r.category,
      label: r.label,
      detail: r.detail,
      confidence: r.confidence ?? 0,
      source_id: r.source_id,
      source_name: r.engine_sources?.name ?? null,
      created_at: r.created_at,
    }));
  });

/* ------------------------------------------------------------------
 * P2-9: Live milestones + reorder
 * ---------------------------------------------------------------- */

export type LiveMilestone = {
  id: string;
  name: string;
  phase: string | null;
  status: string;
  sort_index: number;
  approval_status: string;
  due_date: string | null;
  deadline_relevance: string | null;
  brief_md: string | null;
  client_safe_md: string | null;
  related_gap: string | null;
  related_hidden_asset: string | null;
  related_system_node: string | null;
  source_evidence: Array<{
    source_id?: string;
    signal_id?: string;
    snippet: string;
    category?: string;
  }>;
};

export const listMilestonesLive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<LiveMilestone[]> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_milestones")
      .select(
        "id,name,phase,status,sort_index,approval_status,due_date,deadline_relevance,brief_md,client_safe_md,related_gap,related_hidden_asset,related_system_node,source_evidence",
      )
      .eq("project_id", data.id)
      .order("sort_index", { ascending: true });
    if (error)
      throw new Error((error as { message?: string }).message ?? "milestones fetch failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({ ...r, source_evidence: r.source_evidence ?? [] }));
  });

export const reorderMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        milestoneId: z.string().uuid(),
        direction: z.enum(["up", "down"]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const email = (context as unknown as { claims?: { email?: string } }).claims?.email ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: list } = await sb
      .from("engine_milestones")
      .select("id,name,sort_index")
      .eq("project_id", data.projectId)
      .order("sort_index", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (list ?? []) as any[];
    const idx = rows.findIndex((r) => r.id === data.milestoneId);
    if (idx < 0) throw new Error("Milestone not found");
    const swapWith = data.direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= rows.length) return { ok: true };
    const a = rows[idx];
    const b = rows[swapWith];
    await sb.from("engine_milestones").update({ sort_index: b.sort_index }).eq("id", a.id);
    await sb.from("engine_milestones").update({ sort_index: a.sort_index }).eq("id", b.id);

    // Reorder counts as a draft change — reset builder step to draft.
    const { data: proj } = await sb
      .from("engine_projects")
      .select("step_states")
      .eq("id", data.projectId)
      .single();
    const states = (proj?.step_states ?? {}) as Record<
      string,
      import("@/lib/engine-workspace").StepState
    >;
    states.builder = {
      state: "draft",
      updated_at: new Date().toISOString(),
      updated_by: email,
      note: states.builder?.note ?? null,
    };
    await sb.from("engine_projects").update({ step_states: states }).eq("id", data.projectId);

    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: email,
      action: "milestone_reordered",
      summary: `Moved milestone "${a.name}" ${data.direction}`,
      field_changed: `engine_milestones.sort_index`,
      old_value: String(a.sort_index),
      new_value: String(b.sort_index),
      metadata: { milestone_id: a.id, direction: data.direction },
    });
    await sb.from("engine_change_events").insert({
      project_id: data.projectId,
      kind: "scope_change",
      title: `Milestone reordered: ${a.name}`,
      severity: "info",
      affected_module: "roadmap",
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Next Best Action — recomputed live from project state.
// Backed by SQL function public.compute_engine_next_best_action(uuid).
// Accessible to operators and admins.
// ---------------------------------------------------------------------------

export type NextBestAction = {
  action: string;
  reason: string;
  href: string | null;
  severity: "info" | "warning" | "critical";
};

export const getNextBestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<NextBestAction> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    const isOperator = await hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "operator",
    );
    const isAdmin = await hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "admin",
    );
    if (!isOperator && !isAdmin) throw new Error("Forbidden: operator role required");

    const sb = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data: rows, error } = await sb.rpc("compute_engine_next_best_action", {
      _project_id: data.projectId,
    });
    if (error)
      throw new Error(
        (error as { message?: string }).message ?? "Failed to compute next best action",
      );
    const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    if (!row) {
      return {
        action: "Nothing waiting",
        reason: "All gates clear.",
        href: null,
        severity: "info",
      };
    }
    return {
      action: (row.action as string) ?? "Nothing waiting",
      reason: (row.reason as string) ?? "",
      href: (row.href as string | null) ?? null,
      severity: ((row.severity as string) ?? "info") as NextBestAction["severity"],
    };
  });

// ---------------------------------------------------------------------------
// Project Spine v1 — single payload assembling the living project blueprint.
// Operator/admin only. No client-portal-facing fields.
// ---------------------------------------------------------------------------

export type SpineTask = {
  id: string;
  milestone_id: string;
  phase: string | null;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  owner_email: string | null;
  ai_generated: boolean;
  purpose: string | null;
  expected_artifact: string | null;
  acceptance_criteria: import("@/lib/engine-workspace").Json;
  qa_checklist: import("@/lib/engine-workspace").Json;
  risks: import("@/lib/engine-workspace").Json;
  dependency_notes: string | null;
  blocked_decision: string | null;
  due_date: string | null;
};

export type SpineMilestone = {
  id: string;
  name: string;
  phase: string | null;
  status: string;
  approval_status: string;
  sort_index: number;
  due_date: string | null;
  brief_md: string | null;
  /**
   * Phase 1A follow-up — durable readiness gates for the Milestone
   * Readiness matrix. Computed from real records
   * (frames / mockups / build packets / build evidence / QA plans /
   * QA evidence reviews) scoped to this milestone, NOT from phase/status
   * heuristics. See `deriveMilestoneGatesFromRecords`.
   */
  readiness: MilestoneGates & {
    counts: {
      frames: number;
      mockups: number;
      packets: number;
      evidence: number;
      qa_plans: number;
      qa_reviews: number;
    };
  };
};

export type ProjectSpinePayload = {
  project: {
    id: string;
    name: string;
    status: string;
    current_step: string;
    current_step_num: number;
    frame: string | null;
    goal: string | null;
    point_a: import("@/lib/engine-workspace").Json;
    point_b: import("@/lib/engine-workspace").Json;
    roadmap: import("@/lib/engine-workspace").Json;
    client_company: string;
    client_owner_email: string | null;
    health_score: number;
    updated_at: string;
    client_portal_project_id: string | null;
    /**
     * Phase 1A — durable truth status per Spine section, aggregated from
     * `engine_spine_field_truth`. Null when no field-truth rows exist.
     * Only `approved_truth` counts as approved anywhere in the app.
     */
    point_a_status: SpineFieldStatus | null;
    point_b_status: SpineFieldStatus | null;
  };
  nba: NextBestAction;
  sources: {
    total: number;
    queued: number;
    processing: number;
    failed: number;
    processed: number;
    last_run: {
      id: string;
      status: string;
      error: string | null;
      started_at: string | null;
      finished_at: string | null;
    } | null;
  };
  intelligence: {
    confidence: number | null;
    signal_count: number;
  };
  version: {
    id: string;
    label: string | null;
    status: string;
    created_at: string;
    approved_at: string | null;
    payload: import("@/lib/engine-workspace").Json;
  } | null;
  portal_publish: { id: string; status: string; published_at: string | null } | null;
  milestones: SpineMilestone[];
  tasks: SpineTask[];
  reviews: Array<{
    id: string;
    title: string;
    item_type: string;
    impact: string;
    status: string;
    created_at: string;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    severity: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    created_at: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    summary: string | null;
    actor_email: string | null;
    created_at: string;
  }>;
  modules: SpineModuleSection[];
};

/**
 * Phase 3 — Aggregated module outputs surfaced on the Project Spine.
 *
 * Each entry represents an approvable module output (hidden_assets, gaps,
 * blueprint, sequencing, deadlines, investment) or a derived section that
 * lives inside another jsonb blob (constraints, risks, success_metrics,
 * decisions). Every entry carries per-section readiness so the Spine UI
 * can render advisory status without re-querying.
 */
export type SpineModuleKey =
  | "hidden_assets"
  | "gaps"
  | "blueprint"
  | "sequencing"
  | "deadlines"
  | "investment"
  | "constraints"
  | "risks"
  | "success_metrics"
  | "decisions";

export type SpineModuleReadiness = {
  has_data: boolean;
  approved: boolean;
  /** True when the section has data AND its parent module is approved. */
  ready: boolean;
  /** step_states value from the parent module ("draft"|"review"|"approved"|null). */
  approval_state: "draft" | "review" | "approved" | null;
};

export type SpineModuleSection = {
  key: SpineModuleKey;
  label: string;
  /** Source jsonb blob or table this module reads from. */
  source: string;
  /** Whether this module has its own approval state (direct) or inherits (derived). */
  derived: boolean;
  /** Deep link into the workspace editor for this module. */
  deep_link: string;
  data: import("@/lib/engine-workspace").Json;
  readiness: SpineModuleReadiness;
};


// Phase 4B: field-level history reader for approved spine changes.
// Reads from engine_audit_log filtered to action='spine_field_changed',
// which is what updateProjectStep now writes when the step is point-a/point-b.
// Values are jsonb and passed through as JSON strings so the server-fn
// serializer accepts them; the reader parses them client-side.
export type SpineFieldHistoryEntry = {
  id: string;
  created_at: string;
  actor_email: string | null;
  field_changed: string | null;
  old_value_json: string | null;
  new_value_json: string | null;
  reason: string | null;
  summary: string | null;
  metadata_json: string | null;
};

export const getSpineFieldHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: databaseUuid,
        limit: z.number().int().min(1).max(200).optional().default(25),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ entries: SpineFieldHistoryEntry[] }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_audit_log")
      .select("id,created_at,actor_email,field_changed,old_value,new_value,reason,summary,metadata")
      .eq("project_id", data.projectId)
      .eq("action", "spine_field_changed")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error((error as { message?: string }).message ?? "history read failed");
    const entries: SpineFieldHistoryEntry[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      actor_email: (r.actor_email as string | null) ?? null,
      field_changed: (r.field_changed as string | null) ?? null,
      old_value_json: r.old_value == null ? null : JSON.stringify(r.old_value),
      new_value_json: r.new_value == null ? null : JSON.stringify(r.new_value),
      reason: (r.reason as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      metadata_json: r.metadata == null ? null : JSON.stringify(r.metadata),
    }));
    return { entries };
  });

export const getProjectSpine = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: databaseUuid }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectSpinePayload> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    const isOperator = await hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "operator",
    );
    const isAdmin = await hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "admin",
    );
    if (!isOperator && !isAdmin) throw new Error("Forbidden: operator role required");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    const { data: projRow, error: projErr } = await sb
      .from("engine_projects")
      .select(
        "id,name,status,current_step,current_step_num,updated_at,client_portal_project_id,health_score,point_a,point_b,roadmap,blueprint,hidden_assets,gap_map,sequencing,deadlines,investment,client_preview,step_states,open_decisions, engine_clients(company,owner_email)",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (projErr) throw new Error((projErr as { message?: string }).message ?? "project not found");
    if (!projRow) throw new Error(`Project not found: ${data.id}`);

    // Frame / goal live inside the roadmap or blueprint JSON blobs today.
    const roadmap = (projRow.roadmap ?? {}) as Record<string, unknown>;
    const blueprint = (projRow.blueprint ?? {}) as Record<string, unknown>;
    const frame =
      (roadmap.frame as string | undefined) ??
      (blueprint.frame as string | undefined) ??
      ((projRow.point_b as Record<string, unknown> | null)?.frame as string | undefined) ??
      null;
    const goal =
      (roadmap.goal as string | undefined) ??
      ((projRow.point_b as Record<string, unknown> | null)?.goal as string | undefined) ??
      ((projRow.point_b as Record<string, unknown> | null)?.destination as string | undefined) ??
      null;

    // Next best action via existing RPC
    let nba: NextBestAction = {
      action: "Nothing waiting",
      reason: "",
      href: null,
      severity: "info",
    };
    try {
      const { data: rows } = await sb.rpc("compute_engine_next_best_action", {
        _project_id: data.id,
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        nba = {
          action: (row.action as string) ?? "Nothing waiting",
          reason: (row.reason as string) ?? "",
          href: (row.href as string | null) ?? null,
          severity: ((row.severity as string) ?? "info") as NextBestAction["severity"],
        };
      }
    } catch {
      // fall through with default
    }

    // Sources summary
    const { data: srcRows } = await sb
      .from("engine_sources")
      .select("id,status")
      .eq("project_id", data.id);
    const src = (srcRows ?? []) as Array<{ id: string; status: string }>;
    const sources = {
      total: src.length,
      queued: src.filter((s) => s.status === "queued").length,
      processing: src.filter((s) => s.status === "processing").length,
      failed: src.filter((s) => s.status === "failed").length,
      processed: src.filter((s) => s.status === "processed").length,
      last_run: null as ProjectSpinePayload["sources"]["last_run"],
    };
    const { data: runRows } = await sb
      .from("engine_extraction_runs")
      .select("id,status,error,started_at,finished_at")
      .eq("project_id", data.id)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (runRows && runRows[0]) sources.last_run = runRows[0];

    // Intelligence confidence — avg over extracted signals for this project
    const { data: sigConfRows } = await sb
      .from("engine_extracted_signals")
      .select("confidence")
      .eq("project_id", data.id);
    const sigConfArr = (sigConfRows ?? []) as Array<{ confidence: number | null }>;
    let intelligenceConfidence: number | null = null;
    if (sigConfArr.length > 0) {
      const nums = sigConfArr
        .map((r) => (typeof r.confidence === "number" ? r.confidence : null))
        .filter((n): n is number => n !== null);
      if (nums.length > 0) {
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        // Values may be stored 0-1 or 0-100; normalize to 0-100.
        const max = Math.max(...nums);
        intelligenceConfidence = Math.round(max <= 1 ? mean * 100 : mean);
      }
    }
    const intelligence = {
      confidence: intelligenceConfidence,
      signal_count: sigConfArr.length,
    };

    // Latest roadmap version
    const { data: verRows } = await sb
      .from("engine_roadmap_versions")
      .select("id,label,status,created_at,approved_at,payload")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const version = verRows && verRows[0] ? verRows[0] : null;

    // Phase 1A — Durable Point A / Point B status from engine_spine_field_truth.
    // Aggregated per §3 of PROJECT_SPINE_CONTRACT.md. Only `approved_truth`
    // counts as approved anywhere downstream.
    let point_a_status: SpineFieldStatus | null = null;
    let point_b_status: SpineFieldStatus | null = null;
    try {
      const { data: truthRows, error: truthErr } = await sb
        .from("engine_spine_field_truth")
        .select("spine,status")
        .eq("project_id", data.id);
      if (!truthErr) {
        const rows = (truthRows ?? []) as Array<{ spine: string; status: string }>;
        point_a_status = aggregateSpineStatus(rows.filter((r) => r.spine === "point-a"));
        point_b_status = aggregateSpineStatus(rows.filter((r) => r.spine === "point-b"));
      }
    } catch {
      // Table read failed — leave statuses null so callers render "not started".
    }

    // Portal publish status
    let portal_publish: ProjectSpinePayload["portal_publish"] = null;
    if (projRow.client_portal_project_id) {
      const { data: pubRows } = await sb
        .from("client_portal_roadmaps")
        .select("id,status,published_at")
        .eq("project_id", projRow.client_portal_project_id)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (pubRows && pubRows[0]) portal_publish = pubRows[0];
    }

    // Milestones + tasks
    const { data: msRows } = await sb
      .from("engine_milestones")
      .select("id,name,phase,status,approval_status,sort_index,due_date,brief_md")
      .eq("project_id", data.id)
      .order("sort_index", { ascending: true });
    const milestones = (msRows ?? []) as SpineMilestone[];

    const { data: taskRows } = await sb
      .from("engine_tasks")
      .select(
        "id,milestone_id,phase,name,description,status,priority,owner_email,ai_generated,purpose,expected_artifact,acceptance_criteria,qa_checklist,risks,dependency_notes,blocked_decision,due_date",
      )
      .eq("project_id", data.id)
      .order("created_at", { ascending: true });
    const tasks = (taskRows ?? []) as SpineTask[];

    // Review items (pending only)
    const { data: revRows } = await sb
      .from("engine_review_items")
      .select("id,title,item_type,impact,status,created_at")
      .eq("project_id", data.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    const reviews = (revRows ?? []) as ProjectSpinePayload["reviews"];

    // Activity
    const { data: actRows } = await sb
      .from("engine_activity")
      .select("id,kind,title,body,severity,created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const activity = (actRows ?? []) as ProjectSpinePayload["activity"];

    // Operator notifications (filter by engine_project_id in metadata)
    const { data: notifRows } = await sb
      .from("operator_notifications")
      .select("id,kind,title,body,href,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(50);
    const notifications = (
      (notifRows ?? []) as Array<{
        id: string;
        kind: string;
        title: string;
        body: string | null;
        href: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }>
    )
      .filter(
        (n) => (n.metadata as { engine_project_id?: string } | null)?.engine_project_id === data.id,
      )
      .slice(0, 15)
      .map(({ metadata: _m, ...rest }) => rest);

    // Audit log
    const { data: auditRows } = await sb
      .from("engine_audit_log")
      .select("id,action,summary,actor_email,created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const audit = (auditRows ?? []) as ProjectSpinePayload["audit"];

    // Phase 3 — Aggregated module outputs with per-section readiness.
    // Direct modules read a jsonb column and pair it with the matching
    // step_states approval. Derived modules (constraints/risks/success_metrics/
    // decisions) do not have their own column and inherit the approval state
    // of the parent module that houses them.
    const stepStates =
      (projRow.step_states as Record<
        string,
        { state?: "draft" | "review" | "approved" } | null
      > | null) ?? {};
    const hasKeysOrItems = (v: unknown): boolean => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.trim().length > 0;
      if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
      return false;
    };
    const stepStateOf = (stepKey: string): "draft" | "review" | "approved" | null =>
      stepStates[stepKey]?.state ?? null;
    const asRec = (v: unknown): Record<string, unknown> =>
      v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    const pickPath = (v: unknown, keys: readonly string[]): unknown => {
      const rec = asRec(v);
      for (const k of keys) {
        if (rec[k] != null && hasKeysOrItems(rec[k])) return rec[k];
      }
      return null;
    };
    const buildDirect = (
      key: SpineModuleKey,
      label: string,
      column: string,
      stepKey: string,
      deepLink: string,
      value: unknown,
    ): SpineModuleSection => {
      const state = stepStateOf(stepKey);
      const has_data = hasKeysOrItems(value);
      const approved = state === "approved";
      return {
        key,
        label,
        source: `engine_projects.${column}`,
        derived: false,
        deep_link: deepLink,
        data: (value ?? null) as import("@/lib/engine-workspace").Json,
        readiness: {
          has_data,
          approved,
          ready: has_data && approved,
          approval_state: state,
        },
      };
    };
    const buildDerived = (
      key: SpineModuleKey,
      label: string,
      parentColumn: string,
      parentStepKey: string,
      deepLink: string,
      value: unknown,
    ): SpineModuleSection => {
      const state = stepStateOf(parentStepKey);
      const has_data = hasKeysOrItems(value);
      const approved = state === "approved";
      return {
        key,
        label,
        source: `engine_projects.${parentColumn} (derived)`,
        derived: true,
        deep_link: deepLink,
        data: (value ?? null) as import("@/lib/engine-workspace").Json,
        readiness: {
          has_data,
          approved,
          ready: has_data && approved,
          approval_state: state,
        },
      };
    };

    const linkFor = (suffix: string) => `/engine/projects/${data.id}/${suffix}`;
    const gapMap = projRow.gap_map ?? null;
    const blueprintVal = projRow.blueprint ?? null;
    const pointBVal = projRow.point_b ?? null;
    const roadmapVal = projRow.roadmap ?? null;

    // Decisions: pending review items flagged as decision-shaped, plus the
    // open_decisions counter for a lightweight aggregate.
    const decisionReviews = (reviews ?? []).filter((r) =>
      /decision/i.test(r.item_type ?? ""),
    );
    const decisionsPayload = {
      open_decisions: (projRow.open_decisions as number | null) ?? 0,
      pending: decisionReviews,
    };
    const decisionsHasData = decisionReviews.length > 0 || decisionsPayload.open_decisions > 0;

    const modules: SpineModuleSection[] = [
      buildDirect(
        "hidden_assets",
        "Hidden Assets",
        "hidden_assets",
        "hidden-assets",
        linkFor("hidden-assets"),
        projRow.hidden_assets,
      ),
      buildDirect("gaps", "Gap Map", "gap_map", "gap-map", linkFor("gap-map"), gapMap),
      buildDirect(
        "blueprint",
        "System Blueprint",
        "blueprint",
        "blueprint",
        linkFor("blueprint"),
        blueprintVal,
      ),
      buildDirect(
        "sequencing",
        "Sequencing",
        "sequencing",
        "sequencing",
        linkFor("sequencing"),
        projRow.sequencing,
      ),
      buildDirect(
        "deadlines",
        "Deadlines",
        "deadlines",
        "deadlines",
        linkFor("deadlines"),
        projRow.deadlines,
      ),
      buildDirect(
        "investment",
        "Investment",
        "investment",
        "investment",
        linkFor("investment"),
        projRow.investment,
      ),
      buildDerived(
        "constraints",
        "Constraints",
        "gap_map",
        "gap-map",
        linkFor("gap-map"),
        pickPath(gapMap, ["constraints"]) ??
          pickPath(projRow.point_a, ["constraints"]) ??
          pickPath(blueprintVal, ["constraints"]),
      ),
      buildDerived(
        "risks",
        "Risks",
        "gap_map",
        "gap-map",
        linkFor("gap-map"),
        pickPath(gapMap, ["risks"]) ?? pickPath(projRow.point_a, ["risks"]),
      ),
      buildDerived(
        "success_metrics",
        "Success Metrics",
        "point_b",
        "point-b",
        linkFor("point-b"),
        pickPath(pointBVal, ["success_metrics", "metrics", "measures"]) ??
          pickPath(roadmapVal, ["success_metrics"]),
      ),
      {
        key: "decisions",
        label: "Decisions",
        source: "engine_projects.open_decisions + engine_review_items",
        derived: true,
        deep_link: linkFor("builder"),
        data: decisionsPayload as unknown as import("@/lib/engine-workspace").Json,
        readiness: {
          has_data: decisionsHasData,
          approved: false,
          ready: false,
          approval_state: null,
        },
      },
    ];

    return {
      project: {
        id: projRow.id,
        name: projRow.name,
        status: projRow.status,
        current_step: projRow.current_step,
        current_step_num: projRow.current_step_num ?? 1,
        frame,
        goal,
        point_a: projRow.point_a ?? null,
        point_b: projRow.point_b ?? null,
        roadmap: projRow.roadmap ?? null,
        client_company: projRow.engine_clients?.company ?? "—",
        client_owner_email: (projRow.engine_clients?.owner_email as string | null) ?? null,
        health_score: (projRow.health_score as number | null) ?? 0,
        updated_at: projRow.updated_at,
        client_portal_project_id: projRow.client_portal_project_id ?? null,
        point_a_status,
        point_b_status,
      },
      nba,
      sources,
      intelligence,
      version,
      portal_publish,
      milestones,
      tasks,
      reviews,
      activity,
      notifications,
      audit,
      modules,
    };
  });


// ─────────── Understanding Room ─────────────────────────────────
export type UnderstandingState =
  | "known"
  | "inferred"
  | "needs_confirmation"
  | "missing"
  | "contradictory"
  | "assumed"
  | "approved";

export type UnderstandingSignal = {
  id: string;
  label: string;
  detail: string | null;
  confidence: number;
  category: string;
  created_at: string;
};

export type UnderstandingArea = {
  key: string;
  name: string;
  state: UnderstandingState;
  confidence: number;
  summary: string;
  signals: UnderstandingSignal[];
  last_updated: string | null;
};

export type UnderstandingOpenQuestion = {
  id: string;
  question: string;
  type: "client" | "research" | "internal" | "assumption";
  suggested_action: string;
};

export type UnderstandingRecommendation = {
  id: string;
  title: string;
  reason: string;
  cta: string;
  href?: string | null;
};

export type UnderstandingRoom = {
  areas: UnderstandingArea[];
  summary: {
    overall_confidence: number;
    total_areas: number;
    by_state: Record<UnderstandingState, number>;
    by_confidence: { high: number; medium: number; low: number };
    open_questions_count: number;
  };
  open_questions: UnderstandingOpenQuestion[];
  recommendations: UnderstandingRecommendation[];
};

type UnderstandingArtifactKey =
  | "client"
  | "point_a"
  | "point_b"
  | "hidden_assets"
  | "gap_map"
  | "blueprint"
  | "roadmap"
  | "sequencing"
  | "deadlines"
  | "investment"
  | "client_preview"
  | "spirit_first"
  | "sources";

type UnderstandingAreaDef = {
  key: string;
  name: string;
  categories: string[];
  artifacts: Array<{
    key: UnderstandingArtifactKey;
    label: string;
    confidence: number;
    stepKey?: string;
  }>;
};

const AREA_DEFS: UnderstandingAreaDef[] = [
  {
    key: "business_model",
    name: "Business Model",
    categories: ["business_model"],
    artifacts: [
      { key: "client", label: "Client profile", confidence: 72 },
      { key: "point_a", label: "Point A diagnosis", confidence: 78, stepKey: "point-a" },
    ],
  },
  {
    key: "audience",
    name: "Audience & Customers",
    categories: ["decision_maker", "client_language"],
    artifacts: [
      { key: "client", label: "Client record", confidence: 72 },
      {
        key: "client_preview",
        label: "Client-facing language",
        confidence: 76,
        stepKey: "preview",
      },
      { key: "spirit_first", label: "Spirit First identity signals", confidence: 74 },
    ],
  },
  {
    key: "value_prop",
    name: "Value Proposition",
    categories: ["opportunity", "hidden_asset", "client_language"],
    artifacts: [
      { key: "point_b", label: "Point B destination", confidence: 78, stepKey: "point-b" },
      { key: "hidden_assets", label: "Hidden assets", confidence: 76, stepKey: "hidden-assets" },
      { key: "spirit_first", label: "Trust assets", confidence: 74 },
    ],
  },
  {
    key: "revenue_model",
    name: "Revenue Model",
    categories: ["business_model", "investment_signal"],
    artifacts: [
      { key: "investment", label: "Investment signal", confidence: 72, stepKey: "investment" },
      { key: "client", label: "Client profile", confidence: 68 },
    ],
  },
  {
    key: "current_challenges",
    name: "Current Challenges",
    categories: ["pain", "risk", "constraint", "current_system"],
    artifacts: [
      { key: "point_a", label: "Point A diagnosis", confidence: 80, stepKey: "point-a" },
      { key: "gap_map", label: "Gap map", confidence: 76, stepKey: "gap-map" },
      { key: "spirit_first", label: "Trust deficits", confidence: 74 },
    ],
  },
  {
    key: "existing_systems",
    name: "Existing Systems",
    categories: ["current_system", "required_system"],
    artifacts: [
      { key: "blueprint", label: "System blueprint", confidence: 78, stepKey: "blueprint" },
      { key: "point_a", label: "Current-state diagnosis", confidence: 76, stepKey: "point-a" },
    ],
  },
  {
    key: "digital_presence",
    name: "Digital Presence",
    categories: ["current_system", "required_system"],
    artifacts: [
      { key: "blueprint", label: "Digital system notes", confidence: 72, stepKey: "blueprint" },
      { key: "sources", label: "Source material", confidence: 64 },
    ],
  },
  {
    key: "desired_outcomes",
    name: "Desired Outcomes",
    categories: ["goal", "opportunity"],
    artifacts: [
      { key: "point_b", label: "Point B destination", confidence: 80, stepKey: "point-b" },
      { key: "roadmap", label: "Roadmap draft", confidence: 76, stepKey: "builder" },
    ],
  },
  {
    key: "success_metrics",
    name: "Success Metrics",
    categories: ["goal", "milestone_candidate"],
    artifacts: [
      { key: "roadmap", label: "Roadmap milestones", confidence: 72, stepKey: "builder" },
      { key: "sequencing", label: "Sequencing plan", confidence: 70, stepKey: "sequencing" },
      { key: "client_preview", label: "Client preview", confidence: 68, stepKey: "preview" },
    ],
  },
  {
    key: "assets_strengths",
    name: "Assets & Strengths",
    categories: ["hidden_asset", "opportunity"],
    artifacts: [
      { key: "hidden_assets", label: "Hidden asset map", confidence: 80, stepKey: "hidden-assets" },
      { key: "spirit_first", label: "Trust assets", confidence: 74 },
    ],
  },
  {
    key: "constraints",
    name: "Constraints",
    categories: ["constraint", "investment_signal", "deadline"],
    artifacts: [
      { key: "deadlines", label: "Critical dates", confidence: 76, stepKey: "deadlines" },
      { key: "investment", label: "Investment guardrails", confidence: 74, stepKey: "investment" },
      { key: "gap_map", label: "Gap map", confidence: 72, stepKey: "gap-map" },
    ],
  },
  {
    key: "risks",
    name: "Risks",
    categories: ["risk", "constraint"],
    artifacts: [
      { key: "gap_map", label: "Risk and gap map", confidence: 78, stepKey: "gap-map" },
      { key: "point_a", label: "Current-state diagnosis", confidence: 74, stepKey: "point-a" },
      { key: "spirit_first", label: "Trust deficits", confidence: 72 },
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeUnderstandingConfidence(value: unknown): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const scaled = raw > 0 && raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function cleanUnderstandingText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text === "—") return null;
  return text;
}

function collectUnderstandingText(value: unknown, limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const skipKeys = new Set([
    "id",
    "project_id",
    "client_id",
    "source_id",
    "created_at",
    "updated_at",
    "confidence",
    "status",
  ]);

  const visit = (node: unknown, depth: number) => {
    if (out.length >= limit || depth > 5) return;
    const text = cleanUnderstandingText(node);
    if (text) {
      const normalized = text.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(text);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (isRecord(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (skipKeys.has(key)) continue;
        visit(child, depth + 1);
      }
    }
  };

  visit(value, 0);
  return out;
}

function understandingHeadline(text: string): string {
  const sentence =
    text
      .split(/(?<=[.!?])\s+/)
      .find((part) => part.trim().length >= 8)
      ?.trim() ?? text;
  return sentence.length > 118 ? `${sentence.slice(0, 115).trim()}...` : sentence;
}

function summarizeUnderstandingSources(rows: unknown[]): unknown[] {
  return rows
    .map((row) => {
      if (!isRecord(row)) return null;
      const raw = cleanUnderstandingText(row.raw_text);
      const url = cleanUnderstandingText(row.url);
      const name = cleanUnderstandingText(row.name) ?? "Source";
      const type = cleanUnderstandingText(row.type) ?? "source";
      const text = raw ?? url;
      if (!text) return null;
      return {
        name,
        type,
        summary: text.length > 360 ? `${text.slice(0, 357).trim()}...` : text,
      };
    })
    .filter(Boolean);
}

function artifactSignalsForArea(args: {
  areaKey: string;
  artifactKey: UnderstandingArtifactKey;
  artifactLabel: string;
  artifactValue: unknown;
  confidence: number;
  createdAt: string;
}): UnderstandingSignal[] {
  const texts = collectUnderstandingText(args.artifactValue, 3);
  return texts.map((text, index) => ({
    id: `${args.areaKey}-${args.artifactKey}-${index}`,
    label: `${args.artifactLabel}: ${understandingHeadline(text)}`,
    detail: text,
    confidence: args.confidence,
    category: args.artifactKey,
    created_at: args.createdAt,
  }));
}

export const getUnderstandingRoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: databaseUuid }).parse(raw))
  .handler(async ({ context, data }): Promise<UnderstandingRoom> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    const { data: project, error: projectError } = await sb
      .from("engine_projects")
      .select(
        "id,name,updated_at,step_states,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview,spirit_first_analysis, engine_clients(company,industry,primary_contact,owner_email,notes)",
      )
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) {
      throw new Error(
        (projectError as { message?: string }).message ?? "understanding project fetch failed",
      );
    }
    const projectRow = (project ?? {}) as Record<string, unknown>;
    const clientRow = isRecord(projectRow.engine_clients) ? projectRow.engine_clients : {};
    const stepStates = isRecord(projectRow.step_states)
      ? (projectRow.step_states as Record<string, { state?: string }>)
      : {};
    const projectUpdatedAt =
      cleanUnderstandingText(projectRow.updated_at) ?? new Date().toISOString();

    const { data: sourceRows } = await sb
      .from("engine_sources")
      .select("id,name,type,url,raw_text,status,created_at,updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: sigs } = await sb
      .from("engine_extracted_signals")
      .select("id,label,detail,confidence,category,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    const signals = (
      (sigs ?? []) as Array<{
        id: string;
        label: string;
        detail: string | null;
        confidence: number | null;
        category: string;
        created_at: string;
      }>
    ).map((s) => ({
      ...s,
      confidence: normalizeUnderstandingConfidence(s.confidence),
    }));

    const { data: openQs } = await sb
      .from("engine_extracted_signals")
      .select("id,label,detail,created_at")
      .eq("project_id", data.projectId)
      .eq("category", "open_question")
      .order("created_at", { ascending: false })
      .limit(20);

    const sourceSummary = summarizeUnderstandingSources((sourceRows ?? []) as unknown[]);
    const artifacts: Record<UnderstandingArtifactKey, unknown> = {
      client: clientRow,
      point_a: projectRow.point_a,
      point_b: projectRow.point_b,
      hidden_assets: projectRow.hidden_assets,
      gap_map: projectRow.gap_map,
      blueprint: projectRow.blueprint,
      roadmap: projectRow.roadmap,
      sequencing: projectRow.sequencing,
      deadlines: projectRow.deadlines,
      investment: projectRow.investment,
      client_preview: projectRow.client_preview,
      spirit_first: projectRow.spirit_first_analysis,
      sources: sourceSummary,
    };

    const areas: UnderstandingArea[] = AREA_DEFS.map((def) => {
      const matched = signals.filter((s) => def.categories.includes(s.category));
      const artifactSignals = def.artifacts.flatMap((artifact) => {
        const state = artifact.stepKey ? stepStates[artifact.stepKey]?.state : null;
        const confidence = state === "approved" ? 92 : artifact.confidence;
        return artifactSignalsForArea({
          areaKey: def.key,
          artifactKey: artifact.key,
          artifactLabel: artifact.label,
          artifactValue: artifacts[artifact.key],
          confidence,
          createdAt: projectUpdatedAt,
        });
      });
      const combined = [...matched, ...artifactSignals].slice(0, 12);

      if (matched.length === 0) {
        if (combined.length > 0) {
          const avgConf = Math.round(
            combined.reduce((sum, s) => sum + s.confidence, 0) / combined.length,
          );
          const summary = combined
            .slice(0, 3)
            .map((s) => s.label)
            .join(" · ");
          const last_updated =
            combined
              .map((s) => s.created_at)
              .sort()
              .reverse()[0] ?? projectUpdatedAt;
          const hasApprovedArtifact = def.artifacts.some(
            (artifact) => artifact.stepKey && stepStates[artifact.stepKey]?.state === "approved",
          );
          return {
            key: def.key,
            name: def.name,
            state: hasApprovedArtifact
              ? ("approved" as UnderstandingState)
              : avgConf >= 75
                ? ("known" as UnderstandingState)
                : ("inferred" as UnderstandingState),
            confidence: avgConf,
            summary,
            signals: combined.slice(0, 8),
            last_updated,
          };
        }
        return {
          key: def.key,
          name: def.name,
          state: "missing" as UnderstandingState,
          confidence: 0,
          summary: "No signals captured yet.",
          signals: [],
          last_updated: null,
        };
      }
      const avgConf = Math.round(
        combined.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / combined.length,
      );
      let state: UnderstandingState = "inferred";
      const hasApprovedArtifact = def.artifacts.some(
        (artifact) => artifact.stepKey && stepStates[artifact.stepKey]?.state === "approved",
      );
      const hasOpenQuestion = matched.some((s) => s.category === "open_question");
      const hasContradiction = matched.some((s) =>
        `${s.label} ${s.detail ?? ""}`.toLowerCase().match(/\b(contradict|conflict|disagree)\b/),
      );
      if (hasApprovedArtifact) state = "approved";
      else if (hasContradiction) state = "contradictory";
      else if (hasOpenQuestion) state = "needs_confirmation";
      else if (avgConf >= 85) state = "known";
      else if (avgConf >= 70) state = "inferred";
      else if (avgConf >= 40) state = "needs_confirmation";
      else state = "assumed";

      const top = combined.slice(0, 3);
      const summary = top.map((s) => s.label).join(" · ");
      const last_updated =
        combined
          .map((s) => s.created_at)
          .sort()
          .reverse()[0] ?? null;

      return {
        key: def.key,
        name: def.name,
        state,
        confidence: avgConf,
        summary,
        signals: combined.slice(0, 8),
        last_updated,
      };
    });

    const by_state: Record<UnderstandingState, number> = {
      known: 0,
      inferred: 0,
      needs_confirmation: 0,
      missing: 0,
      contradictory: 0,
      assumed: 0,
      approved: 0,
    };
    let confSum = 0;
    const by_confidence = { high: 0, medium: 0, low: 0 };
    for (const a of areas) {
      by_state[a.state]++;
      confSum += a.confidence;
      if (a.confidence >= 75) by_confidence.high++;
      else if (a.confidence >= 40) by_confidence.medium++;
      else by_confidence.low++;
    }
    const overall_confidence = Math.round(confSum / Math.max(1, areas.length));

    const open_questions: UnderstandingOpenQuestion[] = (openQs ?? []).map(
      (q: { id: string; label: string; detail: string | null }) => ({
        id: q.id,
        question: q.label,
        type: "client" as const,
        suggested_action: "Ask Client",
      }),
    );

    const missingAreas = areas.filter((a) => a.state === "missing").slice(0, 5);
    for (const a of missingAreas) {
      open_questions.push({
        id: `missing-${a.key}`,
        question: `Gather information about ${a.name.toLowerCase()}.`,
        type: "research",
        suggested_action: "Research",
      });
    }

    const recommendations: UnderstandingRecommendation[] = [];
    for (const a of missingAreas.slice(0, 3)) {
      recommendations.push({
        id: `rec-${a.key}`,
        title: `Ask the client about ${a.name.toLowerCase()}`,
        reason: "No signals captured for this area yet.",
        cta: "Ask Client",
      });
    }
    if (overall_confidence >= 75 && by_state.missing <= 2) {
      recommendations.push({
        id: "approve-point-a",
        title: "Approve Point A — understanding is sufficient",
        reason: `Overall confidence at ${overall_confidence}% with limited gaps.`,
        cta: "Approve",
      });
    }

    return {
      areas,
      summary: {
        overall_confidence,
        total_areas: areas.length,
        by_state,
        by_confidence,
        open_questions_count: open_questions.length,
      },
      open_questions: open_questions.slice(0, 10),
      recommendations: recommendations.slice(0, 5),
    };
  });
