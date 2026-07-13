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
    frame: {
      latest_id: string | null;
      status: string | null;
      title: string | null;
      generated_by: string | null;
      page_count: number;
      must_build_count: number;
      flow_count: number;
      open_decisions_count: number;
      backend_requirements_count: number;
      approved_summary: string | null;
      approved_at: string | null;
    } | null;
    family: {
      root_id: string;
      is_root: boolean;
      parent: { id: string; name: string; status: string } | null;
      siblings: Array<{ id: string; name: string; status: string }>;
      children: Array<{
        id: string;
        name: string;
        status: string;
        approved_at: string | null;
        completed_at: string | null;
      }>;
      total_children: number;
      approved_children: number;
      completed_children: number;
    } | null;
    missing_data: string[];
  };
};

export async function buildProjectChatContext(sb: Sb, projectId: string): Promise<ProjectChatContext> {
  const missing: string[] = [];

  const { data: projRow } = await sb
    .from("engine_projects")
    .select(
      "id,name,status,current_step,current_step_num,updated_at,client_portal_project_id,point_a,point_b,roadmap,blueprint,roadmap_version,approved_version,parent_project_id, engine_clients(company)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (!projRow) throw new Error(`Project not found: ${projectId}`);

  // Family block (staff-only chat context; safe to include here because the
  // caller of buildProjectChatContext is already a staff-side surface).
  let familyBlock: ProjectChatContext["json"]["family"] = null;
  try {
    const { findFamilyRootId, fetchFamilySubtree } = await import(
      "@/lib/engine-project-family.server"
    );
    const rootId = await findFamilyRootId(sb, projectId);
    const nodes = await fetchFamilySubtree(sb, rootId);
    const self = nodes.find((n) => n.id === projectId);
    if (self) {
      const parent = self.parent_project_id
        ? nodes.find((n) => n.id === self.parent_project_id) ?? null
        : null;
      const siblings = parent
        ? nodes
            .filter((n) => n.parent_project_id === parent.id && n.id !== projectId)
            .slice(0, 10)
            .map((n) => ({ id: n.id, name: n.name, status: n.status }))
        : [];
      const children = nodes
        .filter((n) => n.parent_project_id === projectId)
        .slice(0, 20)
        .map((n) => ({
          id: n.id,
          name: n.name,
          status: n.status,
          approved_at: n.approved_at,
          completed_at: n.completed_at,
        }));
      const totalChildren = nodes.filter((n) => n.parent_project_id === projectId).length;
      familyBlock = {
        root_id: rootId,
        is_root: !self.parent_project_id,
        parent: parent ? { id: parent.id, name: parent.name, status: parent.status } : null,
        siblings,
        children,
        total_children: totalChildren,
        approved_children: nodes.filter(
          (n) => n.parent_project_id === projectId && !!n.approved_at,
        ).length,
        completed_children: nodes.filter(
          (n) => n.parent_project_id === projectId && !!n.completed_at,
        ).length,
      };
    }
  } catch {
    /* family view/table unreadable — omit */
  }


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

  // Frame Builder — latest + latest approved
  let frameSummary: {
    latest_id: string | null;
    status: string | null;
    title: string | null;
    generated_by: string | null;
    page_count: number;
    must_build_count: number;
    flow_count: number;
    open_decisions_count: number;
    backend_requirements_count: number;
    approved_summary: string | null;
    approved_at: string | null;
  } | null = null;
  try {
    const { data: frameRows } = await sb
      .from("engine_project_frames")
      .select("id,title,status,generated_by,summary,payload,approved_at,created_at")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (frameRows ?? []) as Array<{
      id: string; title: string; status: string; generated_by: string;
      summary: string | null; payload: Record<string, unknown> | null;
      approved_at: string | null; created_at: string;
    }>;
    const latest = rows[0] ?? null;
    const approved = rows.find((r) => r.status === "approved") ?? null;
    if (latest) {
      const p = (latest.payload ?? {}) as {
        pages?: Array<{ priority?: string }>;
        flows?: unknown[];
        open_decisions?: unknown[];
        backend_requirements?: unknown[];
      };
      frameSummary = {
        latest_id: latest.id,
        status: latest.status,
        title: latest.title,
        generated_by: latest.generated_by,
        page_count: p.pages?.length ?? 0,
        must_build_count: (p.pages ?? []).filter((pg) => pg.priority === "must").length,
        flow_count: p.flows?.length ?? 0,
        open_decisions_count: p.open_decisions?.length ?? 0,
        backend_requirements_count: p.backend_requirements?.length ?? 0,
        approved_summary: approved?.summary ?? null,
        approved_at: approved?.approved_at ?? null,
      };
    }
  } catch { /* frame table may not be readable — ignore */ }

  // Mockup Builder — latest + latest approved
  let mockupSummary: {
    latest_id: string | null;
    status: string | null;
    title: string | null;
    generated_by: string | null;
    frame_id: string | null;
    page_count: number;
    must_build_count: number;
    state_count: number;
    global_component_count: number;
    open_decisions_count: number;
    backend_blockers_count: number;
    approved_summary: string | null;
    approved_at: string | null;
    ready_for_backend: boolean;
  } | null = null;
  try {
    const { data: mockupRows } = await sb
      .from("engine_project_mockups")
      .select("id,title,status,generated_by,frame_id,summary,payload,approved_at,created_at")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (mockupRows ?? []) as Array<{
      id: string; title: string; status: string; generated_by: string;
      frame_id: string | null; summary: string | null;
      payload: Record<string, unknown> | null;
      approved_at: string | null; created_at: string;
    }>;
    const latest = rows[0] ?? null;
    const approved = rows.find((r) => r.status === "approved") ?? null;
    if (latest) {
      const p = (latest.payload ?? {}) as {
        pages?: Array<{ priority?: string; states?: unknown[] }>;
        global_components?: unknown[];
        open_decisions?: Array<{ blocks?: string[] }>;
      };
      const pages = p.pages ?? [];
      const backendBlockers = (p.open_decisions ?? []).filter((d) =>
        Array.isArray(d.blocks) && d.blocks.includes("backend"),
      ).length;
      mockupSummary = {
        latest_id: latest.id,
        status: latest.status,
        title: latest.title,
        generated_by: latest.generated_by,
        frame_id: latest.frame_id,
        page_count: pages.length,
        must_build_count: pages.filter((pg) => pg.priority === "must").length,
        state_count: pages.reduce((n, pg) => n + (pg.states?.length ?? 0), 0),
        global_component_count: p.global_components?.length ?? 0,
        open_decisions_count: p.open_decisions?.length ?? 0,
        backend_blockers_count: backendBlockers,
        approved_summary: approved?.summary ?? null,
        approved_at: approved?.approved_at ?? null,
        ready_for_backend: !!approved && backendBlockers === 0,
      };
    }
  } catch { /* mockup table may not be readable — ignore */ }
  // Backend Builder — latest + latest approved
  let backendPlanSummary: {
    latest_id: string | null;
    status: string | null;
    title: string | null;
    generated_by: string | null;
    mockup_id: string | null;
    table_count: number;
    server_function_count: number;
    permission_count: number;
    integration_count: number;
    workflow_count: number;
    open_decisions_count: number;
    implementation_blockers_count: number;
    high_risk_count: number;
    approved_summary: string | null;
    approved_backend_goal: string | null;
    approved_architecture_summary: string | null;
    approved_at: string | null;
    ready_for_implementation: boolean;
  } | null = null;
  try {
    const { data: planRows } = await sb
      .from("engine_project_backend_plans")
      .select("id,title,status,generated_by,mockup_id,summary,payload,approved_at,created_at")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (planRows ?? []) as Array<{
      id: string; title: string; status: string; generated_by: string;
      mockup_id: string | null; summary: string | null;
      payload: Record<string, unknown> | null;
      approved_at: string | null; created_at: string;
    }>;
    const latest = rows[0] ?? null;
    const approved = rows.find((r) => r.status === "approved") ?? null;
    if (latest) {
      const p = (latest.payload ?? {}) as {
        backend_goal?: string;
        architecture_summary?: string;
        data_model?: { tables?: unknown[] };
        server_functions?: unknown[];
        permissions?: unknown[];
        integrations?: unknown[];
        workflows?: unknown[];
        open_decisions?: Array<{ blocks?: string[] }>;
        risks?: Array<{ severity?: string }>;
      };
      const implBlockers = (p.open_decisions ?? []).filter((d) =>
        Array.isArray(d.blocks) && d.blocks.includes("implementation"),
      ).length;
      const highRisks = (p.risks ?? []).filter((r) => r.severity === "high").length;
      const approvedPayload = (approved?.payload ?? {}) as {
        backend_goal?: string;
        architecture_summary?: string;
      };
      backendPlanSummary = {
        latest_id: latest.id,
        status: latest.status,
        title: latest.title,
        generated_by: latest.generated_by,
        mockup_id: latest.mockup_id,
        table_count: p.data_model?.tables?.length ?? 0,
        server_function_count: p.server_functions?.length ?? 0,
        permission_count: p.permissions?.length ?? 0,
        integration_count: p.integrations?.length ?? 0,
        workflow_count: p.workflows?.length ?? 0,
        open_decisions_count: p.open_decisions?.length ?? 0,
        implementation_blockers_count: implBlockers,
        high_risk_count: highRisks,
        approved_summary: approved?.summary ?? null,
        approved_backend_goal: approvedPayload.backend_goal ?? null,
        approved_architecture_summary: approvedPayload.architecture_summary ?? null,
        approved_at: approved?.approved_at ?? null,
        ready_for_implementation: !!approved && implBlockers === 0,
      };
    }
  } catch { /* backend plan table may not be readable — ignore */ }

  // QA Factory — latest + latest approved
  let qaPlanSummary: {
    latest_id: string | null;
    status: string | null;
    title: string | null;
    generated_by: string | null;
    backend_plan_id: string | null;
    overall_readiness: string | null;
    test_count: number;
    blocking_count: number;
    p0_count: number;
    p1_count: number;
    p2_count: number;
    role_test_count: number;
    route_test_count: number;
    data_test_count: number;
    rls_test_count: number;
    workflow_test_count: number;
    ui_state_test_count: number;
    responsive_test_count: number;
    integration_test_count: number;
    audit_test_count: number;
    regression_test_count: number;
    edge_case_count: number;
    evidence_plan_count: number;
    open_decisions_count: number;
    build_blockers_count: number;
    delivery_blockers_count: number;
    high_risk_count: number;
    approved_summary: string | null;
    approved_qa_goal: string | null;
    approved_at: string | null;
    ready_for_build: boolean;
    ready_for_delivery: boolean;
  } | null = null;
  try {
    const { data: qaRows } = await sb
      .from("engine_project_qa_plans")
      .select("id,title,status,generated_by,backend_plan_id,summary,payload,approved_at,created_at")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (qaRows ?? []) as Array<{
      id: string; title: string; status: string; generated_by: string;
      backend_plan_id: string | null; summary: string | null;
      payload: Record<string, unknown> | null;
      approved_at: string | null; created_at: string;
    }>;
    const latest = rows[0] ?? null;
    const approved = rows.find((r) => r.status === "approved") ?? null;
    if (latest) {
      const p = (latest.payload ?? {}) as {
        qa_goal?: string;
        overall_readiness?: string;
        test_matrix?: Array<{ priority?: string; blocking?: boolean }>;
        role_tests?: unknown[]; route_tests?: unknown[]; data_tests?: unknown[];
        rls_tests?: unknown[]; workflow_tests?: unknown[]; ui_state_tests?: unknown[];
        responsive_tests?: unknown[]; integration_tests?: unknown[]; audit_tests?: unknown[];
        regression_tests?: unknown[]; edge_cases?: unknown[]; evidence_plan?: unknown[];
        open_decisions?: Array<{ blocks?: string[] }>;
        go_no_go_criteria?: Array<{ gate?: string }>;
        risks?: Array<{ severity?: string }>;
      };
      const tests = p.test_matrix ?? [];
      const p0 = tests.filter((t) => t.priority === "p0").length;
      const p1 = tests.filter((t) => t.priority === "p1").length;
      const p2 = tests.filter((t) => t.priority === "p2").length;
      const blocking = tests.filter((t) => t.blocking).length;
      const buildBlockers =
        (p.open_decisions ?? []).filter((d) => Array.isArray(d.blocks) && d.blocks.includes("build")).length +
        (p.go_no_go_criteria ?? []).filter((c) => c.gate === "before_build").length;
      const deliveryBlockers =
        (p.open_decisions ?? []).filter((d) => Array.isArray(d.blocks) && d.blocks.includes("delivery")).length +
        (p.go_no_go_criteria ?? []).filter((c) => c.gate === "before_delivery").length;
      const highRisks = (p.risks ?? []).filter((r) => r.severity === "high").length;
      const approvedPayload = (approved?.payload ?? {}) as { qa_goal?: string };
      qaPlanSummary = {
        latest_id: latest.id,
        status: latest.status,
        title: latest.title,
        generated_by: latest.generated_by,
        backend_plan_id: latest.backend_plan_id,
        overall_readiness: p.overall_readiness ?? null,
        test_count: tests.length,
        blocking_count: blocking,
        p0_count: p0,
        p1_count: p1,
        p2_count: p2,
        role_test_count: p.role_tests?.length ?? 0,
        route_test_count: p.route_tests?.length ?? 0,
        data_test_count: p.data_tests?.length ?? 0,
        rls_test_count: p.rls_tests?.length ?? 0,
        workflow_test_count: p.workflow_tests?.length ?? 0,
        ui_state_test_count: p.ui_state_tests?.length ?? 0,
        responsive_test_count: p.responsive_tests?.length ?? 0,
        integration_test_count: p.integration_tests?.length ?? 0,
        audit_test_count: p.audit_tests?.length ?? 0,
        regression_test_count: p.regression_tests?.length ?? 0,
        edge_case_count: p.edge_cases?.length ?? 0,
        evidence_plan_count: p.evidence_plan?.length ?? 0,
        open_decisions_count: p.open_decisions?.length ?? 0,
        build_blockers_count: buildBlockers,
        delivery_blockers_count: deliveryBlockers,
        high_risk_count: highRisks,
        approved_summary: approved?.summary ?? null,
        approved_qa_goal: approvedPayload.qa_goal ?? null,
        approved_at: approved?.approved_at ?? null,
        ready_for_build: !!approved && buildBlockers === 0,
        ready_for_delivery: !!approved && buildBlockers === 0 && deliveryBlockers === 0,
      };
    }
  } catch { /* qa plan table may not be readable — ignore */ }

  // ---------- implementation plan summary ----------
  let implementationPlanSummary: {
    latest_id: string;
    status: string;
    title: string;
    generated_by: string;
    backend_plan_id: string | null;
    qa_plan_id: string | null;
    phase_count: number;
    build_step_count: number;
    p0_count: number;
    p1_count: number;
    p2_count: number;
    high_risk_count: number;
    migration_count: number;
    server_function_count: number;
    ui_wiring_count: number;
    integration_count: number;
    developer_prompt_count: number;
    qa_execution_order_count: number;
    open_decisions_count: number;
    release_gate_count: number;
    approved_summary: string | null;
    approved_goal: string | null;
    approved_at: string | null;
    ready_for_build_execution: boolean;
  } | null = null;
  try {
    const { data: implRows } = await sb
      .from("engine_project_implementation_plans")
      .select("id,title,status,generated_by,backend_plan_id,qa_plan_id,summary,payload,approved_at,created_at")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (implRows ?? []) as Array<{
      id: string; title: string; status: string; generated_by: string;
      backend_plan_id: string | null; qa_plan_id: string | null;
      summary: string | null; payload: Record<string, unknown> | null;
      approved_at: string | null; created_at: string;
    }>;
    const latest = rows[0] ?? null;
    const approved = rows.find((r) => r.status === "approved") ?? null;
    if (latest) {
      const p = (latest.payload ?? {}) as {
        implementation_goal?: string;
        phases?: unknown[];
        build_steps?: Array<{ priority?: string; risk_level?: string }>;
        migration_plan?: unknown[]; server_function_plan?: unknown[];
        ui_wiring_plan?: unknown[]; integration_plan?: unknown[];
        developer_prompts?: unknown[]; qa_execution_order?: unknown[];
        open_decisions?: Array<{ blocks?: string[] }>;
        release_gates?: Array<{ no_go_conditions?: unknown[] }>;
      };
      const steps = p.build_steps ?? [];
      const p0 = steps.filter((s) => s.priority === "p0").length;
      const p1 = steps.filter((s) => s.priority === "p1").length;
      const p2 = steps.filter((s) => s.priority === "p2").length;
      const highRisk = steps.filter((s) => s.risk_level === "high").length;
      const buildBlockers =
        (p.open_decisions ?? []).filter((d) => Array.isArray(d.blocks) && d.blocks.includes("build")).length +
        (p.release_gates ?? []).filter((g) => Array.isArray(g.no_go_conditions) && g.no_go_conditions.length > 0).length;
      const approvedPayload = (approved?.payload ?? {}) as { implementation_goal?: string };
      implementationPlanSummary = {
        latest_id: latest.id,
        status: latest.status,
        title: latest.title,
        generated_by: latest.generated_by,
        backend_plan_id: latest.backend_plan_id,
        qa_plan_id: latest.qa_plan_id,
        phase_count: p.phases?.length ?? 0,
        build_step_count: steps.length,
        p0_count: p0,
        p1_count: p1,
        p2_count: p2,
        high_risk_count: highRisk,
        migration_count: p.migration_plan?.length ?? 0,
        server_function_count: p.server_function_plan?.length ?? 0,
        ui_wiring_count: p.ui_wiring_plan?.length ?? 0,
        integration_count: p.integration_plan?.length ?? 0,
        developer_prompt_count: p.developer_prompts?.length ?? 0,
        qa_execution_order_count: p.qa_execution_order?.length ?? 0,
        open_decisions_count: p.open_decisions?.length ?? 0,
        release_gate_count: p.release_gates?.length ?? 0,
        approved_summary: approved?.summary ?? null,
        approved_goal: approvedPayload.implementation_goal ?? null,
        approved_at: approved?.approved_at ?? null,
        ready_for_build_execution: !!approved && buildBlockers === 0,
      };
    }
  } catch { /* impl plan table may not be readable — ignore */ }

  // ---------- build execution summary ----------
  let buildExecutionSummary: {
    total: number;
    by_status: Record<string, number>;
    next_packet: {
      id: string;
      title: string;
      sequence_number: number;
      packet_type: string;
      priority: string;
      target_builder: string | null;
    } | null;
    blocked_packets: Array<{ id: string; title: string; blockers: string[] }>;
    packets_missing_evidence: Array<{ id: string; title: string; status: string }>;
    rejected_packets: Array<{ id: string; title: string; reason: string | null }>;
    accepted_count: number;
    all_accepted_ready_for_delivery: boolean;
  } | null = null;
  try {
    const { data: pktRows } = await sb
      .from("engine_project_build_packets")
      .select("id,title,status,sequence_number,packet_type,priority,payload,rejected_reason")
      .eq("project_id", projectId)
      .order("sequence_number", { ascending: true });
    const pkts = (pktRows ?? []) as Array<{
      id: string; title: string; status: string; sequence_number: number;
      packet_type: string; priority: string;
      payload: { target_builder?: string; blocking_conditions?: string[]; evidence_required?: string[] } | null;
      rejected_reason: string | null;
    }>;
    if (pkts.length > 0) {
      const by_status: Record<string, number> = {};
      for (const p of pkts) by_status[p.status] = (by_status[p.status] ?? 0) + 1;
      const priOrder = ["p0", "p1", "p2"];
      const readyish = pkts
        .filter((p) => ["ready", "returned", "in_progress"].includes(p.status))
        .sort(
          (a, b) =>
            priOrder.indexOf(a.priority) - priOrder.indexOf(b.priority) ||
            a.sequence_number - b.sequence_number,
        );
      const next = readyish[0] ?? null;
      const blocked = pkts
        .filter((p) => (p.payload?.blocking_conditions ?? []).length > 0)
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          title: p.title,
          blockers: p.payload?.blocking_conditions ?? [],
        }));
      // Packets needing evidence: status qa_required with no evidence
      const qaIds = pkts.filter((p) => p.status === "qa_required").map((p) => p.id);
      let evByPacket: Record<string, number> = {};
      if (qaIds.length > 0) {
        const { data: evRows } = await sb
          .from("engine_project_build_evidence")
          .select("build_packet_id")
          .in("build_packet_id", qaIds);
        for (const r of (evRows ?? []) as Array<{ build_packet_id: string }>) {
          evByPacket[r.build_packet_id] = (evByPacket[r.build_packet_id] ?? 0) + 1;
        }
      }
      const packets_missing_evidence = pkts
        .filter((p) => p.status === "qa_required" && !evByPacket[p.id])
        .slice(0, 10)
        .map((p) => ({ id: p.id, title: p.title, status: p.status }));
      const acceptedCount = by_status.accepted ?? 0;
      const nonArchived = pkts.filter((p) => p.status !== "archived").length;
      buildExecutionSummary = {
        total: pkts.length,
        by_status,
        next_packet: next
          ? {
              id: next.id,
              title: next.title,
              sequence_number: next.sequence_number,
              packet_type: next.packet_type,
              priority: next.priority,
              target_builder: next.payload?.target_builder ?? null,
            }
          : null,
        blocked_packets: blocked,
        packets_missing_evidence,
        rejected_packets: pkts
          .filter((p) => p.status === "rejected")
          .slice(0, 10)
          .map((p) => ({ id: p.id, title: p.title, reason: p.rejected_reason })),
        accepted_count: acceptedCount,
        all_accepted_ready_for_delivery:
          nonArchived > 0 && acceptedCount === nonArchived,
      };
    }
  } catch { /* build packets table may not be readable — ignore */ }

  // ---------- openclaw runs summary ----------
  let openClawSummary: {
    total_runs: number;
    by_status: Record<string, number>;
    latest_run: {
      id: string;
      packet_id: string;
      packet_title: string | null;
      status: string;
      started_at: string;
      error_message: string | null;
    } | null;
    failed_or_timed_out_count: number;
    packets_awaiting_qa_after_openclaw: Array<{ packet_id: string; packet_title: string | null; run_status: string }>;
    artifacts_count: number;
  } | null = null;
  try {
    const { data: runRows } = await sb
      .from("engine_project_openclaw_runs")
      .select("id,build_packet_id,status,started_at,error_message")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(50);
    const runs = (runRows ?? []) as Array<{
      id: string; build_packet_id: string; status: string; started_at: string; error_message: string | null;
    }>;
    if (runs.length > 0) {
      const by_status: Record<string, number> = {};
      for (const r of runs) by_status[r.status] = (by_status[r.status] ?? 0) + 1;
      const packetIds = Array.from(new Set(runs.map((r) => r.build_packet_id)));
      const pktMap = new Map<string, string>();
      if (packetIds.length > 0) {
        const { data: pkts } = await sb
          .from("engine_project_build_packets")
          .select("id,title,status")
          .in("id", packetIds);
        for (const p of (pkts ?? []) as Array<{ id: string; title: string; status: string }>) {
          pktMap.set(p.id, p.title);
        }
      }
      const { count: artCount } = await sb
        .from("engine_project_openclaw_artifacts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      const latest = runs[0];
      const awaitingQa: Array<{ packet_id: string; packet_title: string | null; run_status: string }> = [];
      const seen = new Set<string>();
      for (const r of runs) {
        if (seen.has(r.build_packet_id)) continue;
        if (r.status === "returned_for_review" || r.status === "completed") {
          awaitingQa.push({
            packet_id: r.build_packet_id,
            packet_title: pktMap.get(r.build_packet_id) ?? null,
            run_status: r.status,
          });
          seen.add(r.build_packet_id);
        }
      }
      openClawSummary = {
        total_runs: runs.length,
        by_status,
        latest_run: {
          id: latest.id,
          packet_id: latest.build_packet_id,
          packet_title: pktMap.get(latest.build_packet_id) ?? null,
          status: latest.status,
          started_at: latest.started_at,
          error_message: latest.error_message,
        },
        failed_or_timed_out_count: (by_status.failed ?? 0) + (by_status.timed_out ?? 0),
        packets_awaiting_qa_after_openclaw: awaitingQa.slice(0, 10),
        artifacts_count: artCount ?? 0,
      };
    }
  } catch { /* openclaw tables may not be readable — ignore */ }

  // ---------- openclaw queue summary (v3) ----------
  let openClawQueueSummary: {
    total: number;
    active_status: string | null;
    active_queue_id: string | null;
    active_queue_name: string | null;
    running_item: { packet_id: string; packet_title: string | null; sequence_number: number } | null;
    next_item: { packet_id: string; packet_title: string | null; sequence_number: number } | null;
    queued_count: number;
    failed_count: number;
    blocked_count: number;
    packets_waiting_qa_after_queue: Array<{ packet_id: string; packet_title: string | null }>;
    blockers: string[];
  } | null = null;
  try {
    const { data: queueRows } = await sb
      .from("engine_project_openclaw_queues")
      .select("id,name,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    const queues = (queueRows ?? []) as Array<{ id: string; name: string; status: string; created_at: string }>;
    if (queues.length > 0) {
      const active = queues.find((q) => ["ready", "running", "paused"].includes(q.status)) ?? queues[0];
      const { data: itemRows } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("id,queue_id,build_packet_id,sequence_number,status,error_message")
        .eq("queue_id", active.id)
        .order("sequence_number", { ascending: true });
      const items = (itemRows ?? []) as Array<{
        id: string; queue_id: string; build_packet_id: string; sequence_number: number; status: string; error_message: string | null;
      }>;
      const packetIds = Array.from(new Set(items.map((i) => i.build_packet_id)));
      const pktTitles = new Map<string, string>();
      if (packetIds.length > 0) {
        const { data: pkts } = await sb
          .from("engine_project_build_packets")
          .select("id,title,status")
          .in("id", packetIds);
        for (const p of (pkts ?? []) as Array<{ id: string; title: string; status: string }>) {
          pktTitles.set(p.id, p.title);
        }
      }
      const running = items.find((i) => i.status === "running") ?? null;
      const next = items.find((i) => i.status === "queued") ?? null;
      const failed = items.filter((i) => i.status === "failed");
      const blocked = items.filter((i) => i.status === "blocked");
      const completedItems = items.filter((i) => i.status === "completed");
      const waitingQa: Array<{ packet_id: string; packet_title: string | null }> = [];
      if (completedItems.length > 0) {
        const cids = completedItems.map((i) => i.build_packet_id);
        const { data: cpkts } = await sb
          .from("engine_project_build_packets")
          .select("id,status")
          .in("id", cids);
        for (const p of (cpkts ?? []) as Array<{ id: string; status: string }>) {
          if (p.status === "qa_required" || p.status === "returned") {
            waitingQa.push({ packet_id: p.id, packet_title: pktTitles.get(p.id) ?? null });
          }
        }
      }
      const blockers: string[] = [];
      if (active.status === "paused") blockers.push(`Queue "${active.name}" is paused.`);
      for (const f of failed) blockers.push(`Item #${f.sequence_number} failed: ${(f.error_message ?? "unknown").slice(0, 160)}`);
      for (const b of blocked) blockers.push(`Item #${b.sequence_number} blocked — needs operator review.`);
      openClawQueueSummary = {
        total: queues.length,
        active_status: active.status,
        active_queue_id: active.id,
        active_queue_name: active.name,
        running_item: running
          ? { packet_id: running.build_packet_id, packet_title: pktTitles.get(running.build_packet_id) ?? null, sequence_number: running.sequence_number }
          : null,
        next_item: next
          ? { packet_id: next.build_packet_id, packet_title: pktTitles.get(next.build_packet_id) ?? null, sequence_number: next.sequence_number }
          : null,
        queued_count: items.filter((i) => i.status === "queued").length,
        failed_count: failed.length,
        blocked_count: blocked.length,
        packets_waiting_qa_after_queue: waitingQa.slice(0, 10),
        blockers: blockers.slice(0, 10),
      };
    }
  } catch { /* openclaw queue tables may not be readable — ignore */ }

  // ---------- openclaw monitor summary (v4) ----------
  let openClawMonitorSummary: {
    enabled: boolean;
    latest_tick_at: string | null;
    allow_auto_refresh: boolean;
    allow_auto_run_next: boolean;
    stale_run_minutes: number;
    timeout_minutes: number;
    counts: {
      critical_unack: number;
      warning_unack: number;
      info_unack: number;
      stale_runs: number;
      timed_out_runs: number;
      failed_runs: number;
      queues_needing_attention: number;
      packets_awaiting_qa: number;
      missing_evidence: number;
    };
    recent_events: Array<{ event_type: string; severity: string; summary: string; created_at: string }>;
  } | null = null;
  try {
    const { data: setsRow } = await sb
      .from("engine_project_openclaw_monitor_settings")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    const { data: unackRaw } = await sb
      .from("engine_project_openclaw_monitor_events")
      .select("id,event_type,severity,summary,created_at")
      .eq("project_id", projectId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    const unack = (unackRaw ?? []) as Array<{
      id: string; event_type: string; severity: string; summary: string; created_at: string;
    }>;
    if (setsRow || unack.length > 0) {
      const sets = (setsRow ?? {}) as {
        enabled?: boolean; last_tick_at?: string | null;
        allow_auto_refresh?: boolean; allow_auto_run_next?: boolean;
        stale_run_minutes?: number; timeout_minutes?: number;
      };
      openClawMonitorSummary = {
        enabled: sets.enabled ?? false,
        latest_tick_at: sets.last_tick_at ?? null,
        allow_auto_refresh: sets.allow_auto_refresh ?? false,
        allow_auto_run_next: sets.allow_auto_run_next ?? false,
        stale_run_minutes: sets.stale_run_minutes ?? 15,
        timeout_minutes: sets.timeout_minutes ?? 30,
        counts: {
          critical_unack: unack.filter((e) => e.severity === "critical").length,
          warning_unack: unack.filter((e) => e.severity === "warning").length,
          info_unack: unack.filter((e) => e.severity === "info").length,
          stale_runs: unack.filter((e) => e.event_type === "openclaw_run_stale_detected").length,
          timed_out_runs: unack.filter((e) => e.event_type === "openclaw_run_timed_out").length,
          failed_runs: unack.filter((e) => e.event_type === "openclaw_run_failed_detected").length,
          queues_needing_attention: unack.filter((e) =>
            e.event_type === "openclaw_queue_stale_detected" ||
            e.event_type === "openclaw_queue_failed_detected"
          ).length,
          packets_awaiting_qa: unack.filter((e) => e.event_type === "openclaw_packet_awaiting_qa").length,
          missing_evidence: unack.filter((e) => e.event_type === "openclaw_packet_missing_evidence").length,
        },
        recent_events: unack.slice(0, 10).map((e) => ({
          event_type: e.event_type,
          severity: e.severity,
          summary: e.summary,
          created_at: e.created_at,
        })),
      };
    }
  } catch { /* monitor tables may not be readable — ignore */ }

  // ---------- qa evidence reviews summary (v5) ----------
  let qaEvidenceReviewSummary: {
    total: number;
    by_status: Record<string, number>;
    by_verdict: Record<string, number>;
    latest_approved_at: string | null;
    packets_with_review: number;
    packets_missing_review: number;
    recent: Array<{
      id: string;
      packet_id: string;
      status: string;
      verdict: string;
      title: string;
      updated_at: string;
      generated_by: string;
    }>;
  } | null = null;
  try {
    const { data: revRaw } = await sb
      .from("engine_project_qa_evidence_reviews")
      .select("id,build_packet_id,status,verdict,title,updated_at,approved_at,generated_by")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(50);
    const reviews = (revRaw ?? []) as Array<{
      id: string; build_packet_id: string; status: string; verdict: string;
      title: string; updated_at: string; approved_at: string | null; generated_by: string;
    }>;
    if (reviews.length > 0) {
      const by_status: Record<string, number> = {};
      const by_verdict: Record<string, number> = {};
      for (const r of reviews) {
        by_status[r.status] = (by_status[r.status] ?? 0) + 1;
        by_verdict[r.verdict] = (by_verdict[r.verdict] ?? 0) + 1;
      }
      const packetsWithReview = new Set(reviews.map((r) => r.build_packet_id));
      let packetsMissing = 0;
      try {
        const { data: pktRaw } = await sb
          .from("engine_project_build_packets")
          .select("id,status")
          .eq("project_id", projectId)
          .in("status", ["handed_off", "in_progress", "returned", "qa_required", "accepted"]);
        const pkts = (pktRaw ?? []) as Array<{ id: string; status: string }>;
        packetsMissing = pkts.filter((p) => !packetsWithReview.has(p.id)).length;
      } catch { /* ignore */ }
      const latestApproved = reviews
        .filter((r) => r.status === "approved" && r.approved_at)
        .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""))[0]?.approved_at ?? null;
      qaEvidenceReviewSummary = {
        total: reviews.length,
        by_status,
        by_verdict,
        latest_approved_at: latestApproved,
        packets_with_review: packetsWithReview.size,
        packets_missing_review: packetsMissing,
        recent: reviews.slice(0, 10).map((r) => ({
          id: r.id,
          packet_id: r.build_packet_id,
          status: r.status,
          verdict: r.verdict,
          title: r.title,
          updated_at: r.updated_at,
          generated_by: r.generated_by,
        })),
      };
    }
  } catch { /* qa evidence review table may not be readable — ignore */ }

  // ---------- delivery readiness summary (v6) ----------
  let deliveryReadinessSummary: {
    latest_status: string | null;
    latest_readiness: string | null;
    latest_recommendation: string | null;
    latest_confidence: string | null;
    latest_approved_at: string | null;
    total: number;
    by_status: Record<string, number>;
    by_readiness: Record<string, number>;
    can_prepare_delivery_package: boolean;
    packet_counts: {
      total: number;
      accepted: number;
      missing_acceptance: number;
      rejected: number;
    } | null;
    missing_qa_reviews: number | null;
    critical_monitor_findings: number | null;
    blockers: string[];
    recent: Array<{
      id: string;
      status: string;
      readiness: string;
      recommendation: string;
      updated_at: string;
      generated_by: string;
    }>;
  } | null = null;
  try {
    const { data: drrRaw } = await sb
      .from("engine_project_delivery_readiness_reviews")
      .select("id,status,readiness,recommendation,confidence,updated_at,approved_at,generated_by,payload")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(20);
    const drrs = (drrRaw ?? []) as Array<{
      id: string; status: string; readiness: string; recommendation: string;
      confidence: string; updated_at: string; approved_at: string | null;
      generated_by: string; payload: Record<string, unknown>;
    }>;
    if (drrs.length > 0) {
      const by_status: Record<string, number> = {};
      const by_readiness: Record<string, number> = {};
      for (const r of drrs) {
        by_status[r.status] = (by_status[r.status] ?? 0) + 1;
        by_readiness[r.readiness] = (by_readiness[r.readiness] ?? 0) + 1;
      }
      const latest = drrs[0];
      const latestApproved = drrs
        .filter((r) => r.status === "approved" && r.approved_at)
        .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""))[0] ?? null;
      const pr = (latest.payload?.packet_readiness ?? null) as {
        total_packets?: number; accepted_packets?: number;
        rejected_packets?: number; missing_acceptance?: unknown[];
      } | null;
      const qer = (latest.payload?.qa_evidence_readiness ?? null) as {
        missing_reviews?: unknown[];
      } | null;
      const mf = (latest.payload?.monitor_findings ?? null) as {
        critical_events?: unknown[];
      } | null;
      const blockers = Array.isArray(latest.payload?.blockers)
        ? (latest.payload.blockers as unknown[]).map((x) => String(x)).slice(0, 10)
        : [];
      deliveryReadinessSummary = {
        latest_status: latest.status,
        latest_readiness: latest.readiness,
        latest_recommendation: latest.recommendation,
        latest_confidence: latest.confidence,
        latest_approved_at: latestApproved?.approved_at ?? null,
        total: drrs.length,
        by_status,
        by_readiness,
        can_prepare_delivery_package:
          latest.status === "approved" && latest.readiness === "ready_for_delivery_package",
        packet_counts: pr
          ? {
              total: pr.total_packets ?? 0,
              accepted: pr.accepted_packets ?? 0,
              missing_acceptance: Array.isArray(pr.missing_acceptance)
                ? pr.missing_acceptance.length
                : 0,
              rejected: pr.rejected_packets ?? 0,
            }
          : null,
        missing_qa_reviews: qer && Array.isArray(qer.missing_reviews)
          ? qer.missing_reviews.length
          : null,
        critical_monitor_findings: mf && Array.isArray(mf.critical_events)
          ? mf.critical_events.length
          : null,
        blockers,
        recent: drrs.slice(0, 5).map((r) => ({
          id: r.id,
          status: r.status,
          readiness: r.readiness,
          recommendation: r.recommendation,
          updated_at: r.updated_at,
          generated_by: r.generated_by,
        })),
      };
    }
  } catch { /* delivery readiness table may not be readable — ignore */ }















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
    frame: frameSummary,
    mockup: mockupSummary,
    backend_plan: backendPlanSummary,
    qa_plan: qaPlanSummary,
    implementation_plan: implementationPlanSummary,
    build_execution: buildExecutionSummary,
    openclaw: openClawSummary,
    openclaw_queue: openClawQueueSummary,
    openclaw_monitor: openClawMonitorSummary,
    qa_evidence_reviews: qaEvidenceReviewSummary,
    delivery_readiness: deliveryReadinessSummary,
    family: familyBlock,
    missing_data: missing,
  };

  return { keys: Object.keys(json), json };
}
