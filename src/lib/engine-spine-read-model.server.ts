import { hasRoleForEmail } from "@/lib/ops/access";
import { aggregateSpineStatus, isApprovedTruth } from "@/lib/spine-truth-status";
import type { SpineFieldStatus } from "@/lib/spine-contract";
import { composeSpineView } from "@/lib/spine-variant";
import {
  deriveMilestoneGatesFromRecords,
  payloadMatchesMilestone,
  type MilestoneDurableRecords,
} from "@/lib/milestone-readiness-evaluator";
import type {
  NextBestAction,
  ProjectSpinePayload,
  SpineMilestone,
  SpineModuleKey,
  SpineModuleSection,
  SpineTask,
} from "@/lib/engine.functions";

type SpineContext = {
  claims?: Record<string, unknown>;
  supabase: unknown;
};

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function hasKeysOrItems(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickPath(value: unknown, keys: readonly string[]): unknown {
  const record = asRecord(value);
  for (const key of keys) {
    if (record[key] != null && hasKeysOrItems(record[key])) return record[key];
  }
  return null;
}

async function assertOperator(context: SpineContext) {
  const email = context.claims?.email as string | undefined;
  const isOperator = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  const isAdmin = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!isOperator && !isAdmin) throw new Error("Forbidden: operator role required");
}

export async function getProjectSpineReadModel(
  context: SpineContext,
  projectId: string,
): Promise<ProjectSpinePayload> {
  await assertOperator(context);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = context.supabase as any;

  const { data: projRow, error: projErr } = await sb
    .from("engine_projects")
    .select(
      "id,name,status,current_step,current_step_num,updated_at,client_portal_project_id,health_score,point_a,point_b,roadmap,blueprint,hidden_assets,gap_map,sequencing,deadlines,investment,client_preview,step_states,open_decisions, engine_clients(company,owner_email)",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projErr) throw new Error(errorMessage(projErr, "project not found"));
  if (!projRow) throw new Error(`Project not found: ${projectId}`);

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

  let nba: NextBestAction = {
    action: "Nothing waiting",
    reason: "",
    href: null,
    severity: "info",
  };
  try {
    const { data: rows } = await sb.rpc("compute_engine_next_best_action", {
      _project_id: projectId,
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
    // Keep the default NBA if the advisory RPC is unavailable.
  }

  const { data: srcRows } = await sb
    .from("engine_sources")
    .select("id,status")
    .eq("project_id", projectId);
  const sourceRows = (srcRows ?? []) as Array<{ id: string; status: string }>;
  const sources: ProjectSpinePayload["sources"] = {
    total: sourceRows.length,
    queued: sourceRows.filter((source) => source.status === "queued").length,
    processing: sourceRows.filter((source) => source.status === "processing").length,
    failed: sourceRows.filter((source) => source.status === "failed").length,
    processed: sourceRows.filter((source) => source.status === "processed").length,
    last_run: null,
  };
  const { data: runRows } = await sb
    .from("engine_extraction_runs")
    .select("id,status,error,started_at,finished_at")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (runRows && runRows[0]) sources.last_run = runRows[0];

  const { data: sigConfRows } = await sb
    .from("engine_extracted_signals")
    .select("confidence")
    .eq("project_id", projectId);
  const sigConfArr = (sigConfRows ?? []) as Array<{ confidence: number | null }>;
  let intelligenceConfidence: number | null = null;
  if (sigConfArr.length > 0) {
    const nums = sigConfArr
      .map((row) => (typeof row.confidence === "number" ? row.confidence : null))
      .filter((value): value is number => value !== null);
    if (nums.length > 0) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const max = Math.max(...nums);
      intelligenceConfidence = Math.round(max <= 1 ? mean * 100 : mean);
    }
  }
  const intelligence = {
    confidence: intelligenceConfidence,
    signal_count: sigConfArr.length,
  };

  const { data: verRows } = await sb
    .from("engine_roadmap_versions")
    .select("id,label,status,created_at,approved_at,payload")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  const version = verRows && verRows[0] ? verRows[0] : null;

  let point_a_status: SpineFieldStatus | null = null;
  let point_b_status: SpineFieldStatus | null = null;
  try {
    const { data: truthRows, error: truthErr } = await sb
      .from("engine_spine_field_truth")
      .select("spine,status")
      .eq("project_id", projectId);
    if (!truthErr) {
      const rows = (truthRows ?? []) as Array<{ spine: string; status: string }>;
      point_a_status = aggregateSpineStatus(rows.filter((row) => row.spine === "point-a"));
      point_b_status = aggregateSpineStatus(rows.filter((row) => row.spine === "point-b"));
    }
  } catch {
    // Leave truth states null so callers render the not-started state.
  }

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

  const { data: msRows } = await sb
    .from("engine_milestones")
    .select(
      "id,name,phase,status,approval_status,sort_index,due_date,brief_md,acceptance_criteria,dependencies,owner_email,estimated_cost_cents,approved_at,updated_at",
    )
    .eq("project_id", projectId)
    .order("sort_index", { ascending: true });
  type MilestoneRow = Omit<SpineMilestone, "readiness"> & {
    acceptance_criteria: unknown;
    dependencies: unknown;
    owner_email?: string | null;
    estimated_cost_cents?: number | null;
    approved_at?: string | null;
    updated_at?: string | null;
  };
  const rawMilestones = (msRows ?? []) as Array<MilestoneRow>;

  const [
    { data: frameRows },
    { data: mockupRows },
    { data: packetRows },
    { data: qaPlanRows },
    { data: qaReviewRows },
  ] = await Promise.all([
    sb.from("engine_project_frames").select("id,status,approved_at,payload").eq("project_id", projectId),
    sb.from("engine_project_mockups").select("id,status,approved_at,payload").eq("project_id", projectId),
    sb
      .from("engine_project_build_packets")
      .select("id,status,accepted_at,handed_off_at,payload")
      .eq("project_id", projectId),
    sb.from("engine_project_qa_plans").select("id,status,approved_at,payload").eq("project_id", projectId),
    sb
      .from("engine_project_qa_evidence_reviews")
      .select("id,status,verdict,approved_at,generated_by,openclaw_run_id,build_packet_id,payload")
      .eq("project_id", projectId),
  ]);

  const projectPackets = (packetRows ?? []) as Array<{
    id: string;
    status: string | null;
    accepted_at: string | null;
    handed_off_at: string | null;
    payload: unknown;
  }>;
  const packetIds = projectPackets.map((packet) => packet.id);
  let projectEvidence: Array<{ id: string; build_packet_id: string; evidence_type: string | null }> = [];
  if (packetIds.length > 0) {
    const { data: evRows } = await sb
      .from("engine_project_build_evidence")
      .select("id,build_packet_id,evidence_type")
      .in("build_packet_id", packetIds);
    projectEvidence = (evRows ?? []) as typeof projectEvidence;
  }
  const packetIdToMilestone = new Map<string, string | null>();
  for (const packet of projectPackets) {
    const rec = asRecord(packet.payload);
    const milestoneId =
      (rec.milestone_id as string | undefined) ?? (rec.milestoneId as string | undefined) ?? null;
    packetIdToMilestone.set(packet.id, milestoneId ?? null);
  }

  const milestones: SpineMilestone[] = rawMilestones.map((milestone) => {
    const rec: MilestoneDurableRecords = {
      frames: (frameRows ?? []).filter((row: { payload: unknown }) =>
        payloadMatchesMilestone(row.payload, milestone.id),
      ),
      mockups: (mockupRows ?? []).filter((row: { payload: unknown }) =>
        payloadMatchesMilestone(row.payload, milestone.id),
      ),
      packets: projectPackets.filter((row) => payloadMatchesMilestone(row.payload, milestone.id)),
      evidence: projectEvidence.filter((evidence) => packetIdToMilestone.get(evidence.build_packet_id) === milestone.id),
      qa_plans: (qaPlanRows ?? []).filter((row: { payload: unknown }) =>
        payloadMatchesMilestone(row.payload, milestone.id),
      ),
      qa_reviews: (qaReviewRows ?? []).filter((row: { payload: unknown }) =>
        payloadMatchesMilestone(row.payload, milestone.id),
      ),
    };
    const gates = deriveMilestoneGatesFromRecords(milestone, rec);
    return {
      ...milestone,
      readiness: {
        ...gates,
        counts: {
          frames: rec.frames.length,
          mockups: rec.mockups.length,
          packets: rec.packets.length,
          evidence: rec.evidence.length,
          qa_plans: rec.qa_plans.length,
          qa_reviews: rec.qa_reviews.length,
        },
      },
    };
  });

  const { data: taskRows } = await sb
    .from("engine_tasks")
    .select(
      "id,milestone_id,phase,name,description,status,priority,owner_email,ai_generated,purpose,expected_artifact,acceptance_criteria,qa_checklist,risks,dependency_notes,blocked_decision,due_date",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  const tasks = (taskRows ?? []) as SpineTask[];

  const { data: revRows } = await sb
    .from("engine_review_items")
    .select("id,title,item_type,impact,status,created_at")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews = (revRows ?? []) as ProjectSpinePayload["reviews"];

  const { data: actRows } = await sb
    .from("engine_activity")
    .select("id,kind,title,body,severity,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  const activity = (actRows ?? []) as ProjectSpinePayload["activity"];

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
    .filter((notification) => notification.metadata?.engine_project_id === projectId)
    .slice(0, 15)
    .map(({ metadata: _metadata, ...rest }) => rest);

  const { data: auditRows } = await sb
    .from("engine_audit_log")
    .select("id,action,summary,actor_email,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  const audit = (auditRows ?? []) as ProjectSpinePayload["audit"];

  const stepStates =
    (projRow.step_states as Record<string, { state?: "draft" | "review" | "approved" } | null> | null) ?? {};
  const stepStateOf = (stepKey: string): "draft" | "review" | "approved" | null =>
    stepStates[stepKey]?.state ?? null;
  const buildDirect = (
    key: SpineModuleKey,
    label: string,
    column: string,
    stepKey: string,
    deepLink: string,
    value: unknown,
  ): SpineModuleSection => {
    const state = stepStateOf(stepKey);
    const hasData = hasKeysOrItems(value);
    const approved = state === "approved";
    return {
      key,
      label,
      source: `engine_projects.${column}`,
      derived: false,
      deep_link: deepLink,
      data: (value ?? null) as ProjectSpinePayload["modules"][number]["data"],
      readiness: {
        has_data: hasData,
        approved,
        ready: hasData && approved,
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
    const hasData = hasKeysOrItems(value);
    const approved = state === "approved";
    return {
      key,
      label,
      source: `engine_projects.${parentColumn} (derived)`,
      derived: true,
      deep_link: deepLink,
      data: (value ?? null) as ProjectSpinePayload["modules"][number]["data"],
      readiness: {
        has_data: hasData,
        approved,
        ready: hasData && approved,
        approval_state: state,
      },
    };
  };

  const linkFor = (suffix: string) => `/engine/projects/${projectId}/${suffix}`;
  const gapMap = projRow.gap_map ?? null;
  const blueprintVal = projRow.blueprint ?? null;
  const pointBVal = projRow.point_b ?? null;
  const roadmapVal = projRow.roadmap ?? null;
  const decisionReviews = reviews.filter((review) => /decision/i.test(review.item_type ?? ""));
  const decisionsPayload = {
    open_decisions: (projRow.open_decisions as number | null) ?? 0,
    pending: decisionReviews,
  };
  const decisionsHasData = decisionReviews.length > 0 || decisionsPayload.open_decisions > 0;

  const modules: SpineModuleSection[] = [
    buildDirect("hidden_assets", "Hidden Assets", "hidden_assets", "hidden-assets", linkFor("hidden-assets"), projRow.hidden_assets),
    buildDirect("gaps", "Gap Map", "gap_map", "gap-map", linkFor("gap-map"), gapMap),
    buildDirect("blueprint", "System Blueprint", "blueprint", "blueprint", linkFor("blueprint"), blueprintVal),
    buildDirect("sequencing", "Sequencing", "sequencing", "sequencing", linkFor("sequencing"), projRow.sequencing),
    buildDirect("deadlines", "Deadlines", "deadlines", "deadlines", linkFor("deadlines"), projRow.deadlines),
    buildDirect("investment", "Investment", "investment", "investment", linkFor("investment"), projRow.investment),
    buildDerived(
      "constraints",
      "Constraints",
      "gap_map",
      "gap-map",
      linkFor("gap-map"),
      pickPath(gapMap, ["constraints"]) ?? pickPath(projRow.point_a, ["constraints"]) ?? pickPath(blueprintVal, ["constraints"]),
    ),
    buildDerived("risks", "Risks", "gap_map", "gap-map", linkFor("gap-map"), pickPath(gapMap, ["risks"]) ?? pickPath(projRow.point_a, ["risks"])),
    buildDerived(
      "success_metrics",
      "Success Metrics",
      "point_b",
      "point-b",
      linkFor("point-b"),
      pickPath(pointBVal, ["success_metrics", "metrics", "measures"]) ?? pickPath(roadmapVal, ["success_metrics"]),
    ),
    {
      key: "decisions",
      label: "Decisions",
      source: "engine_projects.open_decisions + engine_review_items",
      derived: true,
      deep_link: linkFor("builder"),
      data: decisionsPayload as ProjectSpinePayload["modules"][number]["data"],
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
    view: composeSpineView({
      pointAApproved: isApprovedTruth(point_a_status),
      pointBApproved: isApprovedTruth(point_b_status),
      milestones: milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        approval_status: milestone.approval_status,
        status: milestone.status,
        due_date: milestone.due_date,
      })),
      portal_publish,
      reviews,
      activity,
      sources,
    }),
  };
}