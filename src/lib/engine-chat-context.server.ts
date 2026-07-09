// Server-only. Builds a compact, safe project context payload for the
// Project Intelligence Layer (Project Chat). Reads only from the tables
// listed below, scoped by project_id, using the middleware-bound Supabase
// client (RLS applies as the calling operator/admin).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type ProjectChatContext = {
  keys: string[];
  json: {
    project: {
      id: string;
      name: string;
      status: string;
      current_step: string;
      current_step_num: number;
      client_company: string;
      frame: string | null;
      goal: string | null;
      updated_at: string;
      roadmap_version: string | null;
      approved_version: string | null;
    };
    next_best_action: { action: string; reason: string; href: string | null; severity: string };
    sources: {
      total: number;
      queued: number;
      processing: number;
      failed: number;
      processed: number;
    };
    milestones: Array<{
      id: string;
      name: string;
      phase: string | null;
      status: string;
      approval_status: string | null;
      due_date: string | null;
      task_count: number;
    }>;
    tasks: {
      total: number;
      by_status: Record<string, number>;
      blocked: Array<{ id: string; name: string; milestone_id: string | null; blocked_decision: string | null }>;
      suggested_unapproved: Array<{ id: string; name: string; milestone_id: string | null }>;
      needs_owner: Array<{ id: string; name: string }>;
    };
    reviews_pending: Array<{ id: string; title: string; item_type: string; impact: string; created_at: string }>;
    activity_recent: Array<{ kind: string; title: string; severity: string; created_at: string }>;
    notifications_recent: Array<{ kind: string; title: string; href: string | null; created_at: string }>;
    audit_recent: Array<{ action: string; summary: string | null; actor_email: string | null; created_at: string }>;
    qa_gates: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }>;
    portal_publish: { status: string; published_at: string | null } | null;
    missing_data: string[];
  };
};

export async function buildProjectChatContext(sb: Sb, projectId: string): Promise<ProjectChatContext> {
  const missing: string[] = [];

  const { data: projRow } = await sb
    .from("engine_projects")
    .select(
      "id,name,status,current_step,current_step_num,updated_at,client_portal_project_id,point_a,point_b,roadmap,blueprint,roadmap_version,approved_version, engine_clients(company)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (!projRow) throw new Error(`Project not found: ${projectId}`);

  const roadmap = (projRow.roadmap ?? {}) as Record<string, unknown>;
  const blueprint = (projRow.blueprint ?? {}) as Record<string, unknown>;
  const point_b = (projRow.point_b as Record<string, unknown> | null) ?? null;
  const frame =
    (roadmap.frame as string | undefined) ??
    (blueprint.frame as string | undefined) ??
    (point_b?.frame as string | undefined) ??
    null;
  const goal =
    (roadmap.goal as string | undefined) ??
    (point_b?.goal as string | undefined) ??
    (point_b?.destination as string | undefined) ??
    null;
  if (!frame) missing.push("frame");
  if (!goal) missing.push("point_b_goal");
  if (!projRow.point_a) missing.push("point_a");

  let nba = { action: "Nothing waiting", reason: "", href: null as string | null, severity: "info" };
  try {
    const { data: rows } = await sb.rpc("compute_engine_next_best_action", { _project_id: projectId });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      nba = {
        action: (row.action as string) ?? "Nothing waiting",
        reason: (row.reason as string) ?? "",
        href: (row.href as string | null) ?? null,
        severity: (row.severity as string) ?? "info",
      };
    }
  } catch {
    /* default */
  }

  const { data: srcRows } = await sb
    .from("engine_sources")
    .select("id,status")
    .eq("project_id", projectId);
  const src = (srcRows ?? []) as Array<{ status: string }>;
  const sources = {
    total: src.length,
    queued: src.filter((s) => s.status === "queued").length,
    processing: src.filter((s) => s.status === "processing").length,
    failed: src.filter((s) => s.status === "failed").length,
    processed: src.filter((s) => s.status === "processed").length,
  };
  if (sources.total === 0) missing.push("sources");

  const { data: msRows } = await sb
    .from("engine_milestones")
    .select("id,name,phase,status,approval_status,due_date,sort_index")
    .eq("project_id", projectId)
    .order("sort_index", { ascending: true });
  const milestonesRaw = (msRows ?? []) as Array<{
    id: string; name: string; phase: string | null; status: string; approval_status: string | null; due_date: string | null;
  }>;

  const { data: taskRows } = await sb
    .from("engine_tasks")
    .select("id,milestone_id,name,status,priority,owner_email,ai_generated,blocked_decision")
    .eq("project_id", projectId);
  const tasks = (taskRows ?? []) as Array<{
    id: string; milestone_id: string | null; name: string; status: string; priority: string | null;
    owner_email: string | null; ai_generated: boolean | null; blocked_decision: string | null;
  }>;

  const taskCountByMs = new Map<string, number>();
  for (const t of tasks) {
    if (t.milestone_id) taskCountByMs.set(t.milestone_id, (taskCountByMs.get(t.milestone_id) ?? 0) + 1);
  }
  const milestones = milestonesRaw.map((m) => ({
    ...m,
    task_count: taskCountByMs.get(m.id) ?? 0,
  }));

  const by_status: Record<string, number> = {};
  for (const t of tasks) by_status[t.status] = (by_status[t.status] ?? 0) + 1;
  const blocked = tasks
    .filter((t) => t.status === "blocked")
    .slice(0, 20)
    .map((t) => ({ id: t.id, name: t.name, milestone_id: t.milestone_id, blocked_decision: t.blocked_decision }));
  const suggested_unapproved = tasks
    .filter((t) => t.ai_generated && ["todo", "suggested", "proposed", "draft", "pending"].includes(t.status))
    .slice(0, 20)
    .map((t) => ({ id: t.id, name: t.name, milestone_id: t.milestone_id }));
  const needs_owner = tasks
    .filter((t) => !t.owner_email && t.status !== "done")
    .slice(0, 20)
    .map((t) => ({ id: t.id, name: t.name }));

  const { data: revRows } = await sb
    .from("engine_review_items")
    .select("id,title,item_type,impact,status,created_at")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews_pending = ((revRows ?? []) as Array<{
    id: string; title: string; item_type: string; impact: string; created_at: string;
  }>);

  const { data: actRows } = await sb
    .from("engine_activity")
    .select("kind,title,severity,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(15);
  const activity_recent = ((actRows ?? []) as Array<{
    kind: string; title: string; severity: string; created_at: string;
  }>);

  const { data: notifRows } = await sb
    .from("operator_notifications")
    .select("kind,title,href,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(50);
  const notifications_recent = ((notifRows ?? []) as Array<{
    kind: string; title: string; href: string | null; created_at: string; metadata: Record<string, unknown> | null;
  }>)
    .filter((n) => (n.metadata as { engine_project_id?: string } | null)?.engine_project_id === projectId)
    .slice(0, 15)
    .map(({ metadata: _m, ...rest }) => rest);

  const { data: auditRows } = await sb
    .from("engine_audit_log")
    .select("action,summary,actor_email,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(15);
  const audit_recent = ((auditRows ?? []) as Array<{
    action: string; summary: string | null; actor_email: string | null; created_at: string;
  }>);

  // Portal publish (internal status metadata only — never expose portal
  // private fields to the model).
  let portal_publish: { status: string; published_at: string | null } | null = null;
  if (projRow.client_portal_project_id) {
    const { data: pubRows } = await sb
      .from("client_portal_roadmaps")
      .select("status,published_at,updated_at")
      .eq("project_id", projRow.client_portal_project_id)
      .order("updated_at", { ascending: false })
      .limit(1);
    const r = pubRows && pubRows[0];
    if (r) portal_publish = { status: r.status, published_at: r.published_at };
  }

  // QA gates — derived, not model-guessed.
  const qa_gates: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
  qa_gates.push({
    name: "Point A captured",
    status: projRow.point_a ? "pass" : "fail",
    detail: projRow.point_a ? "Point A recorded" : "Point A missing",
  });
  qa_gates.push({
    name: "Point B goal defined",
    status: goal ? "pass" : "fail",
    detail: goal ? "Goal recorded" : "Point B goal missing",
  });
  qa_gates.push({
    name: "Sources ingested",
    status: sources.processed > 0 ? "pass" : sources.total > 0 ? "warn" : "fail",
    detail: `${sources.processed}/${sources.total} processed`,
  });
  qa_gates.push({
    name: "Roadmap has milestones",
    status: milestones.length > 0 ? "pass" : "fail",
    detail: `${milestones.length} milestones`,
  });
  qa_gates.push({
    name: "Every milestone has tasks",
    status: milestones.every((m) => m.task_count > 0) ? "pass" : "warn",
    detail: `${milestones.filter((m) => m.task_count === 0).length} milestone(s) without tasks`,
  });
  qa_gates.push({
    name: "No blocked tasks",
    status: blocked.length === 0 ? "pass" : "fail",
    detail: `${blocked.length} blocked task(s)`,
  });
  qa_gates.push({
    name: "No pending reviews",
    status: reviews_pending.length === 0 ? "pass" : "warn",
    detail: `${reviews_pending.length} pending review item(s)`,
  });
  qa_gates.push({
    name: "AI-suggested tasks all approved",
    status: suggested_unapproved.length === 0 ? "pass" : "warn",
    detail: `${suggested_unapproved.length} suggested task(s) awaiting approval`,
  });
  qa_gates.push({
    name: "Roadmap version approved",
    status: projRow.approved_version ? "pass" : projRow.roadmap_version ? "warn" : "fail",
    detail: projRow.approved_version
      ? `Approved version: ${projRow.approved_version}`
      : projRow.roadmap_version
        ? `Latest version ${projRow.roadmap_version} not yet approved`
        : "No roadmap version yet",
  });

  const json = {
    project: {
      id: projRow.id as string,
      name: projRow.name as string,
      status: projRow.status as string,
      current_step: (projRow.current_step as string) ?? "",
      current_step_num: (projRow.current_step_num as number) ?? 1,
      client_company: projRow.engine_clients?.company ?? "—",
      frame,
      goal,
      updated_at: projRow.updated_at as string,
      roadmap_version: (projRow.roadmap_version as string | null) ?? null,
      approved_version: (projRow.approved_version as string | null) ?? null,
    },
    next_best_action: nba,
    sources,
    milestones,
    tasks: {
      total: tasks.length,
      by_status,
      blocked,
      suggested_unapproved,
      needs_owner,
    },
    reviews_pending,
    activity_recent,
    notifications_recent,
    audit_recent,
    qa_gates,
    portal_publish,
    missing_data: missing,
  };

  return { keys: Object.keys(json), json };
}
