import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { WorkspaceProject, WorkspaceStepKey } from "@/lib/engine-workspace";

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

async function fetchProjects(
  supabase: {
    from: (t: string) => {
      select: (
        s: string,
      ) => {
        order: (
          col: string,
          o?: { ascending?: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  },
): Promise<{
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
  for (const d of (dateData ?? []) as Array<{ project_id: string; label: string; due_on: string }>) {
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
      if (a.severity === "error") { systemHealth = "red"; break; }
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

    // Signals this month
    const { count: signalCount } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string, o: { count: "exact"; head: true }) => {
          gte: (c: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    })
      .from("engine_signals")
      .select("id", { count: "exact", head: true })
      .gte("received_at", monthStart);

    const { data: alertData } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: unknown }> };
        };
      };
    })
      .from("engine_activity")
      .select("id,title,body,severity,created_at,project_id, engine_projects(name)")
      .order("created_at", { ascending: false })
      .limit(6);

    const alerts = ((alertData ?? []) as Array<{
      id: string;
      title: string;
      body: string | null;
      severity: string;
      created_at: string;
      project_id: string | null;
      engine_projects: { name: string } | null;
    }>).map((a) => ({
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
                    (new Date(p.next_critical_date.due_on).getTime() - now) /
                      (24 * 3600 * 1000),
                  ),
              )
            : 0),
      }))
      .sort((a, b) => b._rank - a._rank)
      .slice(0, 6)
      .map(({ _rank: _r, ...rest }) => rest);

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
        (r) =>
          r.name.toLowerCase().includes(q) || r.client_company.toLowerCase().includes(q),
      );
    }
    return { rows: out };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { data: p, error } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    })
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

    const { data: datesData } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }>;
          };
        };
      };
    })
      .from("engine_project_dates")
      .select("id,label,due_on,kind")
      .eq("project_id", data.id)
      .order("due_on", { ascending: true });

    const { data: signalData } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown }>;
            };
          };
        };
      };
    })
      .from("engine_signals")
      .select("id,source,summary,received_at,triaged")
      .eq("project_id", data.id)
      .order("received_at", { ascending: false })
      .limit(10);

    const { data: actData } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown }>;
            };
          };
        };
      };
    })
      .from("engine_activity")
      .select("id,kind,title,body,severity,created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      project,
      dates: (datesData ?? []) as Array<{ id: string; label: string; due_on: string; kind: string }>,
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
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ project: WorkspaceProject; dates: Array<{ id: string; label: string; due_on: string; kind: string }>; activity: Array<{ id: string; kind: string; title: string; body: string | null; severity: string; created_at: string }> }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            single: () => Promise<{ data: unknown; error: unknown }>;
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown }>;
            } & Promise<{ data: unknown }>;
          };
        };
      };
    };
    const { data: p, error } = await sb.from("engine_projects").select(WORKSPACE_SELECT).eq("id", data.id).single();
    if (error) throw new Error((error as { message?: string }).message ?? "not found");
    const row = p as Record<string, unknown> & { engine_clients: { company: string; owner_email: string | null } | null };

    const { data: datesData } = await sb.from("engine_project_dates").select("id,label,due_on,kind").eq("project_id", data.id).order("due_on", { ascending: true });
    const { data: actData } = await sb.from("engine_activity").select("id,kind,title,body,severity,created_at").eq("project_id", data.id).order("created_at", { ascending: false }).limit(20);

    const project: WorkspaceProject = {
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      current_step_num: (row.current_step_num as number) ?? 1,
      progress_pct: (row.progress_pct as number) ?? 0,
      health_score: (row.health_score as number) ?? 0,
      roadmap_version: (row.roadmap_version as string | null) ?? null,
      approved_version: (row.approved_version as string | null) ?? null,
      agent_status: (row.agent_status as string) ?? "idle",
      agent_budget_monthly_cents: (row.agent_budget_monthly_cents as number) ?? 0,
      agent_spend_month_cents: (row.agent_spend_month_cents as number) ?? 0,
      open_decisions: (row.open_decisions as number) ?? 0,
      next_action: (row.next_action as string | null) ?? null,
      last_activity_at: row.last_activity_at as string,
      updated_at: row.updated_at as string,
      client_company: row.engine_clients?.company ?? "—",
      client_owner_email: row.engine_clients?.owner_email ?? null,
      step_states: (row.step_states as Record<string, import("@/lib/engine-workspace").StepState>) ?? {},

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
      dates: (datesData ?? []) as Array<{ id: string; label: string; due_on: string; kind: string }>,
      activity: (actData ?? []) as Array<{ id: string; kind: string; title: string; body: string | null; severity: string; created_at: string }>,
    };
  });

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
    "signal-room","extraction","point-a","point-b","hidden-assets","gap-map","blueprint","builder","sequencing","deadlines","investment","preview","delivery",
  ]),
  data: z.record(z.string(), z.unknown()),
  // Optimistic-lock guard. When present, the update fails if another writer
  // has changed the project since the caller loaded it. Client passes the
  // `updated_at` seen at edit time.
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
});

export const updateProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateStepInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const col = STEP_COLUMNS[data.step as WorkspaceStepKey];
    if (!col) throw new Error("Unknown step");
    const email = ((context as unknown as { claims?: { email?: string } }).claims?.email) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Read current step_states + updated_at so we can merge state and detect
    // concurrent writes.
    const { data: cur } = await sb
      .from("engine_projects")
      .select("step_states, updated_at")
      .eq("id", data.id)
      .single();
    const states = (cur?.step_states ?? {}) as Record<string, import("@/lib/engine-workspace").StepState>;
    const currentUpdatedAt = (cur?.updated_at as string | null) ?? null;

    // Optimistic lock: bail out early with a clear error if the row moved
    // under the caller. Client can re-open the editor with fresh data.
    if (
      data.expectedUpdatedAt
      && currentUpdatedAt
      && new Date(data.expectedUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime()
    ) {
      throw new Error(
        "This project changed while you were editing. Reload to see the latest and try again.",
      );
    }

    // Pillar 6: protect operator-approved diagnostic modules from silent
    // re-writes. Point A / Point B once approved represent Tai's signed-off
    // diagnosis + destination; overwriting them from the workspace should
    // require a fresh state transition (approved → draft via setStepState).
    const PROTECTED_APPROVED_STEPS = new Set<WorkspaceStepKey>([
      "point-a",
      "point-b",
    ]);
    if (
      PROTECTED_APPROVED_STEPS.has(data.step as WorkspaceStepKey)
      && states[data.step]?.state === "approved"
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
    return { ok: true };
  });

/* ------------------------------------------------------------------
 * P2-8: Per-step state machine
 * ---------------------------------------------------------------- */

const SetStepStateInput = z.object({
  id: z.string().uuid(),
  step: z.enum([
    "signal-room","extraction","point-a","point-b","hidden-assets","gap-map","blueprint","builder","sequencing","deadlines","investment","preview","delivery",
  ]),
  state: z.enum(["draft", "review", "approved"]),
  note: z.string().max(500).nullable().optional(),
});

export const setStepState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SetStepStateInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const email = ((context as unknown as { claims?: { email?: string } }).claims?.email) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: cur } = await sb
      .from("engine_projects")
      .select("step_states")
      .eq("id", data.id)
      .single();
    const states = (cur?.step_states ?? {}) as Record<string, import("@/lib/engine-workspace").StepState>;
    const prev = states[data.step]?.state ?? null;
    states[data.step] = {
      state: data.state,
      updated_at: new Date().toISOString(),
      updated_by: email,
      note: data.note ?? null,
    };
    const { error } = await sb.from("engine_projects").update({ step_states: states }).eq("id", data.id);
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
    z.object({
      id: z.string().uuid(),
      categories: z.array(z.string()).max(20).default([]),
    }).parse(raw),
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
  source_evidence: Array<{ source_id?: string; signal_id?: string; snippet: string; category?: string }>;
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
      .select("id,name,phase,status,sort_index,approval_status,due_date,deadline_relevance,brief_md,client_safe_md,related_gap,related_hidden_asset,related_system_node,source_evidence")
      .eq("project_id", data.id)
      .order("sort_index", { ascending: true });
    if (error) throw new Error((error as { message?: string }).message ?? "milestones fetch failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({ ...r, source_evidence: r.source_evidence ?? [] }));
  });

export const reorderMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid(),
      direction: z.enum(["up", "down"]),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const email = ((context as unknown as { claims?: { email?: string } }).claims?.email) ?? null;
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
    const { data: proj } = await sb.from("engine_projects").select("step_states").eq("id", data.projectId).single();
    const states = (proj?.step_states ?? {}) as Record<string, import("@/lib/engine-workspace").StepState>;
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


