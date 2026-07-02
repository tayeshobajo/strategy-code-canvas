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
  roadmap_version: string | null;
  approved_version: string | null;
  agent_status: string;
  agent_budget_monthly_cents: number;
  agent_spend_month_cents: number;
  open_decisions: number;
  next_action: string | null;
  last_activity_at: string;
  next_critical_date: { label: string; due_on: string } | null;
};

export type CommandCenterPayload = {
  metrics: {
    active_projects: number;
    new_signals: number;
    roadmaps_in_progress: number;
    needs_review: number;
    approved: number;
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
  engine_clients: { company: string; industry: string | null } | null;
};

function mapRow(
  r: ProjectDbRow,
  dateByProject: Map<string, { label: string; due_on: string }>,
): EngineProjectRow {
  return {
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    client_company: r.engine_clients?.company ?? "—",
    client_industry: r.engine_clients?.industry ?? null,
    status: r.status,
    current_step: r.current_step,
    roadmap_version: r.roadmap_version,
    approved_version: r.approved_version,
    agent_status: r.agent_status,
    agent_budget_monthly_cents: r.agent_budget_monthly_cents,
    agent_spend_month_cents: r.agent_spend_month_cents,
    open_decisions: r.open_decisions,
    next_action: r.next_action,
    last_activity_at: r.last_activity_at,
    next_critical_date: dateByProject.get(r.id) ?? null,
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
): Promise<{ rows: ProjectDbRow[]; dates: Map<string, { label: string; due_on: string }> }> {
  const { data, error } = await supabase
    .from("engine_projects")
    .select(
      "id,name,client_id,status,current_step,roadmap_version,approved_version,agent_status,agent_budget_monthly_cents,agent_spend_month_cents,open_decisions,next_action,last_activity_at, engine_clients(company,industry)",
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
  return { rows, dates };
}

export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommandCenterPayload> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const { rows, dates } = await fetchProjects(context.supabase as never);
    const projects = rows.map((r) => mapRow(r, dates));

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
      roadmaps_in_progress: projects.filter(
        (p) => p.status === "draft" || p.current_step === "roadmap_drafting",
      ).length,
      needs_review: projects.filter((p) => p.status === "needs_review").length,
      approved: projects.filter((p) => p.status === "approved").length,
      deliveries_pending: projects.filter((p) => p.status === "delivered").length,
      in_execution: projects.filter((p) => p.status === "in_execution").length,
      blocked_decisions: projects.filter((p) => p.status === "blocked").length,
      agent_spend_cents: projects.reduce((s, p) => s + p.agent_spend_month_cents, 0),
      agent_budget_cents: projects.reduce((s, p) => s + p.agent_budget_monthly_cents, 0),
      system_health: "green" as const,
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

    return {
      metrics,
      priority_queue: priority,
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
    const { rows, dates } = await fetchProjects(context.supabase as never);
    let out = rows.map((r) => mapRow(r, dates));
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
  "id,name,status,current_step_num,progress_pct,health_score,roadmap_version,approved_version,agent_status,agent_budget_monthly_cents,agent_spend_month_cents,open_decisions,next_action,last_activity_at,signal_room,extraction,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview,delivery, engine_clients(company,owner_email)";

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
      client_company: row.engine_clients?.company ?? "—",
      client_owner_email: row.engine_clients?.owner_email ?? null,
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
});

export const updateProjectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateStepInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context as unknown as Parameters<typeof assertAdmin>[0]);
    const col = STEP_COLUMNS[data.step as WorkspaceStepKey];
    if (!col) throw new Error("Unknown step");
    const email = ((context as unknown as { claims?: { email?: string } }).claims?.email) ?? null;
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { error } = await sb.from("engine_projects").update({ [col]: data.data }).eq("id", data.id);
    if (error) throw new Error((error as { message?: string }).message ?? "update failed");

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

