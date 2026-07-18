/**
 * Project Work Tab — pure derivation.
 *
 * Composes a server-owned `ProjectWorkReadModel` from raw durable rows.
 * NO DB calls, NO React. Safe to import from server functions and unit
 * tests.
 *
 * Governing invariant: every WorkItem MUST trace back to an approved
 * milestone (approval_status = 'approved'). Rows that don't trace are
 * routed to `off_roadmap` and never appear in the main queue.
 */

import type { MilestoneGates } from "@/lib/milestone-readiness-evaluator";

// ---------- inputs ----------

export type RawMilestone = {
  id: string;
  name: string;
  phase: string | null;
  status: string;
  approval_status: string;
  brief_md: string | null;
  due_date: string | null;
  owner_email: string | null;
  estimated_cost_cents: number | null;
  acceptance_criteria: unknown;
  dependencies: unknown;
  sort_index: number | null;
  approved_at: string | null;
  updated_at: string;
  readiness?: MilestoneGates | null;
};

export type RawTask = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  name: string;
  purpose: string | null;
  expected_artifact: string | null;
  status: string;
  priority: string;
  owner_email: string | null;
  due_date: string | null;
  estimated_effort_hours: number | null;
  estimated_cost_cents: number | null;
  acceptance_criteria: unknown;
  qa_checklist: unknown;
  dependency_notes: string | null;
  blocked_decision: string | null;
  ai_generated: boolean;
  agent_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RawBuildPacket = {
  id: string;
  status: string;
  packet_type: string;
  priority: string;
  title: string;
  summary: string | null;
  assigned_to: string | null;
  accepted_at: string | null;
  handed_off_at: string | null;
  rejected_reason: string | null;
  payload: unknown;
};

export type RawBuildEvidence = {
  id: string;
  build_packet_id: string;
  evidence_type: string;
  title: string;
  created_at: string;
};

export type RawAgentTask = {
  id: string;
  kind: string;
  status: string;
  related_module: string | null;
  pending_approval: boolean;
  error: string | null;
  cost_cents: number;
  created_by_email: string | null;
  updated_at: string;
  created_at: string;
};

export type RawReviewItem = {
  id: string;
  title: string;
  item_type: string;
  status: string;
  severity: string | null;
  impact: string;
  impact_score: number | null;
  urgency_score: number | null;
  risk_score: number;
  deadline_at: string | null;
  requested_by: string | null;
  created_at: string;
};

export type RawActivity = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  actor_email: string | null;
  created_at: string;
};

// ---------- outputs ----------

export type WorkItemStatus =
  | "draft"
  | "ready"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "submitted"
  | "evidence_review"
  | "accepted"
  | "complete"
  | "rejected"
  | "superseded"
  | "cancelled";

export type WorkItemPriority = "critical" | "high" | "medium" | "low";

export type MilestoneWorkState =
  | "not_ready"
  | "ready_to_plan"
  | "planning"
  | "ready_for_mockups"
  | "mockups_in_review"
  | "ready_for_build"
  | "in_build"
  | "blocked"
  | "ready_for_qa"
  | "in_qa"
  | "ready_for_delivery"
  | "complete";

export type WorkHealth =
  | "on_track"
  | "needs_attention"
  | "at_risk"
  | "blocked";

export type GateState = "done" | "current" | "locked" | "n_a" | "in_progress";

export type MilestoneGateProgression = {
  brief: GateState;
  criteria: GateState;
  mockups: GateState;
  build: GateState;
  qa: GateState;
  delivery: GateState;
};

export type WorkItem = {
  id: string;
  project_id: string;
  milestone_id: string;
  milestone_name: string;
  name: string;
  purpose: string;
  expected_artifact: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  owner_type: "human" | "agent";
  owner_id: string | null;
  reviewer_id: string | null;
  approver_id: string | null;
  due_date: string | null;
  dependencies: string[];
  blockers: string[];
  evidence_required: number;
  evidence_attached: number;
  evidence_accepted: number;
  estimated_effort_hours: number | null;
  estimated_cost_cents: number | null;
  actual_cost_cents: number | null;
  next_action: string;
  scope_drift: boolean;
  self_approval_violation: boolean;
  created_at: string;
  updated_at: string;
};

export type MilestoneExecutionSummary = {
  id: string;
  name: string;
  outcome: string;
  phase: string | null;
  work_state: MilestoneWorkState;
  health: WorkHealth;
  owner: string | null;
  due_date: string | null;
  current_gate: keyof MilestoneGateProgression;
  gates: MilestoneGateProgression;
  active_tasks: number;
  blocked_tasks: number;
  expected_artifact: string;
  evidence_required: number;
  evidence_attached: number;
  cost_allocated_cents: number | null;
  cost_spent_cents: number | null;
  next_action: string;
  ready_for_qa: boolean;
  readiness_missing: string[];
  mockups_required: boolean;
};

export type AgentAssignment = {
  id: string;
  role: string;
  current_work: string;
  state:
    | "working"
    | "monitoring"
    | "waiting"
    | "needs_clarification"
    | "blocked"
    | "failed"
    | "complete"
    | "idle";
  waiting_reason: string | null;
  last_activity_at: string;
  cost_cents: number;
  milestone_id: string | null;
};

export type WorkBlocker = {
  id: string;
  title: string;
  blocker_type:
    | "missing_approval"
    | "client_dependency"
    | "external_integration"
    | "unresolved_requirement"
    | "missing_evidence"
    | "failed_qa"
    | "dependency_conflict"
    | "budget_or_capacity"
    | "agent_failure"
    | "scope_ambiguity"
    | "other";
  milestone_id: string | null;
  milestone_name: string | null;
  what_it_blocks: string;
  owner: string | null;
  age_days: number;
  due_date: string | null;
  impact: "critical" | "high" | "medium" | "low";
  recommended_resolution: string;
};

export type WorkApproval = {
  id: string;
  title: string;
  approval_type:
    | "execution_packet"
    | "acceptance_criteria"
    | "mockups"
    | "scope_change"
    | "build_acceptance"
    | "evidence_acceptance"
    | "qa_handoff"
    | "delivery_readiness";
  what_it_unlocks: string;
  impact: "critical" | "high" | "medium" | "low";
  approver: string | null;
  due_date: string | null;
};

export type WorkNextBestAction = {
  action: string;
  milestone_id: string | null;
  milestone_name: string | null;
  why_it_matters: string;
  what_it_unlocks: string;
  owner: string | null;
  due_date: string | null;
  impact: "critical" | "high" | "medium" | "low";
  cta_label: string;
  cta_kind: "resolve_blocker" | "open_milestone" | "review_approval" | "assign_owner" | "none";
} | null;

export type WorkCaptainBrief = {
  what_changed: string;
  what_matters_now: string;
  recommendation: string;
  watch_for: string;
};

export type MaterialChange = {
  id: string;
  title: string;
  body: string | null;
  actor: string | null;
  severity: string;
  created_at: string;
};

export type WorkCostSummary = {
  mtd_spend_cents: number;
  burn_per_day_cents: number;
  value_blocked_cents: number;
  allocated_cents: number;
};

export type CapacitySummary = {
  active_agents: number;
  active_humans: number;
  capacity_load_pct: number;
  waiting_count: number;
};

export type QaHandoffCandidate = {
  milestone_id: string;
  milestone_name: string;
  reasons_ready: string[];
};

export type ProjectWorkReadModel = {
  project: { id: string; name: string; status: string; parent_project_id: string | null };
  mode:
    | "no_roadmap"
    | "roadmap_no_ready_milestone"
    | "no_active_work"
    | "active";
  execution_phase: string | null;
  current_version_label: string | null;
  last_material_change: MaterialChange | null;
  work_health: WorkHealth;
  summary: {
    ready_to_start: number;
    in_progress: number;
    blocked: number;
    awaiting_approval: number;
    awaiting_client: number;
    ready_for_qa: number;
    active_agents: number;
    value_blocked_cents: number;
  };
  next_best_action: WorkNextBestAction;
  captain_brief: WorkCaptainBrief;
  milestones: MilestoneExecutionSummary[];
  queue: WorkItem[];
  off_roadmap: WorkItem[];
  agents: AgentAssignment[];
  blockers: WorkBlocker[];
  approvals: WorkApproval[];
  changes: MaterialChange[];
  cost: WorkCostSummary;
  capacity: CapacitySummary;
  qa_handoffs: QaHandoffCandidate[];
};

// ---------- inputs bundle ----------

export type WorkViewInputs = {
  project: { id: string; name: string; status: string; parent_project_id: string | null };
  approved_version_label: string | null;
  has_approved_roadmap: boolean;
  milestones: readonly RawMilestone[];
  tasks: readonly RawTask[];
  packets: ReadonlyMap<string /* milestone_id */, readonly RawBuildPacket[]>;
  evidence: ReadonlyMap<string /* build_packet_id */, readonly RawBuildEvidence[]>;
  qa_plans: ReadonlyMap<string /* milestone_id */, { has_plan: boolean }>;
  agent_tasks: readonly RawAgentTask[];
  review_items: readonly RawReviewItem[];
  activity: readonly RawActivity[];
  now?: Date;
};

// ---------- helpers ----------

const AGENT_EMAIL_HINTS = [
  "agent",
  "bot",
  "captain",
  "openclaw",
  "automation",
  "@ai",
];

function isAgentOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return AGENT_EMAIL_HINTS.some((h) => lower.includes(h));
}

function toStrList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86_400_000));
}

function mapTaskStatus(s: string): WorkItemStatus {
  const v = s.toLowerCase();
  const known: WorkItemStatus[] = [
    "draft",
    "ready",
    "assigned",
    "in_progress",
    "blocked",
    "submitted",
    "evidence_review",
    "accepted",
    "complete",
    "rejected",
    "superseded",
    "cancelled",
  ];
  if ((known as string[]).includes(v)) return v as WorkItemStatus;
  if (v === "done" || v === "completed") return "complete";
  if (v === "in-progress" || v === "active" || v === "doing") return "in_progress";
  if (v === "todo" || v === "pending" || v === "open") return "ready";
  if (v === "review" || v === "in_review") return "evidence_review";
  return "draft";
}

function mapPriority(p: string): WorkItemPriority {
  const v = p.toLowerCase();
  if (v === "critical" || v === "p0") return "critical";
  if (v === "high" || v === "p1") return "high";
  if (v === "low" || v === "p3") return "low";
  return "medium";
}

/**
 * Derive the milestone gate progression displayed on cards. Enforces the
 * predecessor rule: a downstream gate can never be `current` or `done`
 * while an upstream gate is still `locked` or `in_progress`.
 */
export function deriveGateProgression(
  m: RawMilestone,
  hasPackets: boolean,
  hasAcceptedPackets: boolean,
  hasMockups: boolean,
  hasApprovedMockups: boolean,
  mockupsRequired: boolean,
  hasEvidence: boolean,
  hasQaPlan: boolean,
): MilestoneGateProgression {
  const criteriaList = toStrList(m.acceptance_criteria);
  const brief: GateState = m.brief_md && m.brief_md.trim().length > 0 ? "done" : "current";
  const criteria: GateState =
    brief !== "done"
      ? "locked"
      : m.approval_status === "approved"
        ? "done"
        : criteriaList.length > 0
          ? "in_progress"
          : "current";
  const mockupsGate: GateState = !mockupsRequired
    ? "n_a"
    : criteria !== "done"
      ? "locked"
      : hasApprovedMockups
        ? "done"
        : hasMockups
          ? "in_progress"
          : "current";
  const buildBlocked =
    criteria !== "done" || (mockupsRequired && mockupsGate !== "done" && mockupsGate !== "n_a");
  const build: GateState = buildBlocked
    ? "locked"
    : hasAcceptedPackets
      ? "done"
      : hasPackets
        ? "in_progress"
        : "current";
  const qa: GateState =
    build !== "done"
      ? "locked"
      : !hasEvidence
        ? "current"
        : hasQaPlan
          ? "in_progress"
          : "current";
  const delivery: GateState = (qa as GateState) === "done" ? "current" : "locked";
  return { brief, criteria, mockups: mockupsGate, build, qa, delivery };
}

function currentGate(g: MilestoneGateProgression): keyof MilestoneGateProgression {
  const order: Array<keyof MilestoneGateProgression> = [
    "brief",
    "criteria",
    "mockups",
    "build",
    "qa",
    "delivery",
  ];
  for (const k of order) {
    const s = g[k];
    if (s === "current" || s === "in_progress") return k;
    if (s === "locked") return k;
  }
  return "delivery";
}

function workStateFromGates(
  g: MilestoneGateProgression,
  milestoneStatus: string,
  hasApprovedRoadmap: boolean,
  milestoneApprovalStatus: string,
): MilestoneWorkState {
  if (milestoneStatus === "blocked") return "blocked";
  if (!hasApprovedRoadmap || milestoneApprovalStatus !== "approved") return "not_ready";
  if (g.delivery === "done") return "complete";
  if (g.qa === "done") return "ready_for_delivery";
  if (g.qa === "in_progress") return "in_qa";
  if (g.build === "done") return "ready_for_qa";
  if (g.build === "in_progress") return "in_build";
  if (g.mockups === "in_progress") return "mockups_in_review";
  if (g.mockups === "current") return "ready_for_mockups";
  if (g.criteria === "done") return "ready_for_build";
  if (g.criteria === "in_progress") return "planning";
  if (g.brief === "done") return "ready_to_plan";
  return "not_ready";
}

function healthFromSignals(
  workState: MilestoneWorkState,
  blockedTasks: number,
  overdue: boolean,
  scopeDrift: boolean,
): WorkHealth {
  if (workState === "blocked" || blockedTasks > 1) return "blocked";
  if (scopeDrift || overdue) return "at_risk";
  if (blockedTasks === 1) return "needs_attention";
  return "on_track";
}

function classifyBlocker(r: RawReviewItem): WorkBlocker["blocker_type"] {
  const s = `${r.item_type} ${r.title}`.toLowerCase();
  if (s.includes("approval")) return "missing_approval";
  if (s.includes("client")) return "client_dependency";
  if (s.includes("integration") || s.includes("api")) return "external_integration";
  if (s.includes("evidence")) return "missing_evidence";
  if (s.includes("qa") || s.includes("test")) return "failed_qa";
  if (s.includes("depend")) return "dependency_conflict";
  if (s.includes("budget") || s.includes("cost") || s.includes("capacity"))
    return "budget_or_capacity";
  if (s.includes("agent")) return "agent_failure";
  if (s.includes("scope")) return "scope_ambiguity";
  if (s.includes("requirement")) return "unresolved_requirement";
  return "other";
}

function impactFrom(impact: string, score: number | null): WorkBlocker["impact"] {
  const i = impact.toLowerCase();
  if (i.includes("critical") || (score ?? 0) >= 8) return "critical";
  if (i.includes("high") || (score ?? 0) >= 6) return "high";
  if (i.includes("low")) return "low";
  return "medium";
}

function agentStateFrom(
  status: string,
  pending: boolean,
  error: string | null,
): AgentAssignment["state"] {
  if (error) return "failed";
  if (pending) return "needs_clarification";
  const s = status.toLowerCase();
  if (s === "applied" || s === "saved_as_task") return "complete";
  if (s === "rejected") return "failed";
  if (s === "draft") return "monitoring";
  return "working";
}

// ---------- main derivation ----------

export function deriveProjectWork(inputs: WorkViewInputs): ProjectWorkReadModel {
  const now = inputs.now ?? new Date();

  // Gate: no approved roadmap → return locked mode.
  if (!inputs.has_approved_roadmap) {
    return emptyReadModel(inputs, "no_roadmap");
  }

  // ---------- milestones ----------

  const milestones: MilestoneExecutionSummary[] = [];
  const readyMilestones: MilestoneExecutionSummary[] = [];
  const qaHandoffs: QaHandoffCandidate[] = [];

  const tasksByMilestone = new Map<string, RawTask[]>();
  for (const t of inputs.tasks) {
    if (!t.milestone_id) continue;
    const arr = tasksByMilestone.get(t.milestone_id) ?? [];
    arr.push(t);
    tasksByMilestone.set(t.milestone_id, arr);
  }

  for (const m of inputs.milestones) {
    const mTasks = tasksByMilestone.get(m.id) ?? [];
    const activeTasks = mTasks.filter((t) => {
      const s = mapTaskStatus(t.status);
      return s === "in_progress" || s === "assigned" || s === "ready";
    }).length;
    const blockedTasks = mTasks.filter((t) => mapTaskStatus(t.status) === "blocked").length;

    const packets = inputs.packets.get(m.id) ?? [];
    const hasPackets = packets.length > 0;
    const hasAcceptedPackets = packets.length > 0 && packets.every((p) => p.accepted_at);

    // Mockups requirement: derived from the milestone's readiness gates when
    // available; falls back to "required unless brief marks it visual: false".
    const mockupsRequired =
      m.readiness?.mockups === "not_applicable" ? false : true;
    const hasMockups = (m.readiness?.mockups ?? "not_configured") !== "not_configured";
    const hasApprovedMockups = m.readiness?.mockups === "done";

    const evidenceForMilestone = packets.flatMap(
      (p) => inputs.evidence.get(p.id) ?? [],
    );
    const hasEvidence = evidenceForMilestone.length > 0;
    const evidenceRequired = Math.max(packets.length, 1);
    const evidenceAttached = evidenceForMilestone.length;

    const qaPlan = inputs.qa_plans.get(m.id);
    const hasQaPlan = qaPlan?.has_plan ?? false;

    const gates = deriveGateProgression(
      m,
      hasPackets,
      hasAcceptedPackets,
      hasMockups,
      hasApprovedMockups,
      mockupsRequired,
      hasEvidence,
      hasQaPlan,
    );
    const workState = workStateFromGates(
      gates,
      m.status,
      inputs.has_approved_roadmap,
      m.approval_status,
    );
    const overdue = m.due_date ? new Date(m.due_date).getTime() < now.getTime() : false;
    const health = healthFromSignals(workState, blockedTasks, overdue, false);

    // Readiness-missing list — human-readable "why not ready?" reasons.
    const readinessMissing: string[] = [];
    if (!m.brief_md) readinessMissing.push("Brief");
    if (m.approval_status !== "approved") readinessMissing.push("Approved criteria");
    if (mockupsRequired && !hasApprovedMockups) readinessMissing.push("Approved mockups");
    if (!m.owner_email) readinessMissing.push("Owner assigned");
    if (!m.due_date) readinessMissing.push("Due date");

    const readyForQa =
      workState === "ready_for_qa" &&
      hasQaPlan &&
      blockedTasks === 0 &&
      inputs.review_items.every((r) => r.status !== "open");
    if (readyForQa) {
      qaHandoffs.push({
        milestone_id: m.id,
        milestone_name: m.name,
        reasons_ready: [
          "Build packets accepted",
          "Evidence attached",
          "QA plan present",
          "No open blockers",
        ],
      });
    }

    const expectedArtifact =
      packets.find((p) => (p.payload as { expected_artifact?: string } | null)?.expected_artifact)
        ?.payload as { expected_artifact?: string } | undefined;

    milestones.push({
      id: m.id,
      name: m.name,
      outcome:
        (m.brief_md ?? "").split("\n").find((l) => l.trim().length > 0)?.slice(0, 220) ??
        "Outcome pending brief.",
      phase: m.phase,
      work_state: workState,
      health,
      owner: m.owner_email,
      due_date: m.due_date,
      current_gate: currentGate(gates),
      gates,
      active_tasks: activeTasks,
      blocked_tasks: blockedTasks,
      expected_artifact:
        expectedArtifact?.expected_artifact ??
        (mockupsRequired
          ? "Approved delivery meeting acceptance criteria."
          : "Working implementation meeting acceptance criteria."),
      evidence_required: evidenceRequired,
      evidence_attached: evidenceAttached,
      cost_allocated_cents: m.estimated_cost_cents,
      cost_spent_cents: null,
      next_action:
        workState === "blocked"
          ? "Resolve blocker"
          : workState === "ready_for_qa"
            ? "Send to QA"
            : workState === "ready_for_mockups"
              ? "Approve mockups"
              : workState === "ready_for_build"
                ? "Start build"
                : workState === "ready_to_plan"
                  ? "Draft acceptance criteria"
                  : "Open workspace",
      ready_for_qa: readyForQa,
      readiness_missing: readinessMissing,
      mockups_required: mockupsRequired,
    });

    if (workState !== "not_ready" && workState !== "complete") {
      readyMilestones.push(milestones[milestones.length - 1]!);
    }
  }

  if (milestones.length === 0 || readyMilestones.length === 0) {
    const skeleton = emptyReadModel(inputs, "roadmap_no_ready_milestone");
    return { ...skeleton, milestones };
  }

  // ---------- work items ----------

  const approvedMilestoneIds = new Set(
    inputs.milestones.filter((m) => m.approval_status === "approved").map((m) => m.id),
  );
  const nameByMilestoneId = new Map(inputs.milestones.map((m) => [m.id, m.name]));

  const queue: WorkItem[] = [];
  const offRoadmap: WorkItem[] = [];

  for (const t of inputs.tasks) {
    const status = mapTaskStatus(t.status);
    const item: WorkItem = {
      id: t.id,
      project_id: t.project_id,
      milestone_id: t.milestone_id ?? "",
      milestone_name: t.milestone_id ? (nameByMilestoneId.get(t.milestone_id) ?? "Unknown") : "—",
      name: t.name,
      purpose: t.purpose ?? "Purpose not documented.",
      expected_artifact: t.expected_artifact ?? "Artifact not documented.",
      status,
      priority: mapPriority(t.priority),
      owner_type: isAgentOwner(t.owner_email) || t.ai_generated ? "agent" : "human",
      owner_id: t.owner_email,
      reviewer_id: null,
      approver_id: null,
      due_date: t.due_date,
      dependencies: t.dependency_notes ? [t.dependency_notes] : [],
      blockers: t.blocked_decision ? [t.blocked_decision] : [],
      evidence_required: toStrList(t.qa_checklist).length,
      evidence_attached: 0,
      evidence_accepted: 0,
      estimated_effort_hours: t.estimated_effort_hours,
      estimated_cost_cents: t.estimated_cost_cents,
      actual_cost_cents: null,
      next_action:
        status === "blocked"
          ? "Resolve blocker"
          : status === "submitted"
            ? "Review evidence"
            : status === "ready"
              ? "Start"
              : status === "in_progress"
                ? "Continue"
                : status === "accepted"
                  ? "Close out"
                  : "Open",
      scope_drift: false,
      self_approval_violation: false,
      created_at: t.created_at,
      updated_at: t.updated_at,
    };
    if (!t.milestone_id || !approvedMilestoneIds.has(t.milestone_id)) {
      offRoadmap.push(item);
    } else {
      queue.push(item);
    }
  }

  // ---------- agents ----------

  const agents: AgentAssignment[] = inputs.agent_tasks
    .slice(0, 25)
    .map((a) => ({
      id: a.id,
      role: humanizeAgentRole(a.related_module ?? a.kind),
      current_work: humanizeAgentKind(a.kind),
      state: agentStateFrom(a.status, a.pending_approval, a.error),
      waiting_reason: a.pending_approval ? "Awaiting human review" : a.error,
      last_activity_at: a.updated_at,
      cost_cents: a.cost_cents,
      milestone_id: null,
    }));
  const activeAgents = agents.filter(
    (a) => a.state === "working" || a.state === "waiting" || a.state === "needs_clarification",
  ).length;

  // ---------- blockers & approvals ----------

  const openBlockers: WorkBlocker[] = inputs.review_items
    .filter((r) => r.status === "open" || r.item_type.toLowerCase().includes("blocker"))
    .map((r) => {
      const created = new Date(r.created_at);
      return {
        id: r.id,
        title: r.title,
        blocker_type: classifyBlocker(r),
        milestone_id: null,
        milestone_name: null,
        what_it_blocks: r.impact || "downstream execution",
        owner: r.requested_by,
        age_days: daysBetween(now, created),
        due_date: r.deadline_at,
        impact: impactFrom(r.impact, r.impact_score),
        recommended_resolution:
          r.severity === "critical"
            ? "Escalate to admin immediately"
            : "Resolve with owner today",
      };
    });

  const openApprovals: WorkApproval[] = inputs.review_items
    .filter((r) => r.item_type.toLowerCase().includes("approval") && r.status !== "closed")
    .map((r) => ({
      id: r.id,
      title: r.title,
      approval_type:
        (r.item_type.toLowerCase().includes("mockup")
          ? "mockups"
          : r.item_type.toLowerCase().includes("packet")
            ? "execution_packet"
            : r.item_type.toLowerCase().includes("qa")
              ? "qa_handoff"
              : "acceptance_criteria") as WorkApproval["approval_type"],
      what_it_unlocks: r.impact || "milestone progression",
      impact: impactFrom(r.impact, r.impact_score),
      approver: r.requested_by,
      due_date: r.deadline_at,
    }));

  // ---------- summary ----------

  const summary = {
    ready_to_start: queue.filter((w) => w.status === "ready").length,
    in_progress: queue.filter((w) => w.status === "in_progress").length,
    blocked: queue.filter((w) => w.status === "blocked").length + openBlockers.length,
    awaiting_approval: queue.filter((w) => w.status === "submitted" || w.status === "evidence_review").length + openApprovals.length,
    awaiting_client: openBlockers.filter((b) => b.blocker_type === "client_dependency").length,
    ready_for_qa: qaHandoffs.length,
    active_agents: activeAgents,
    value_blocked_cents: milestones
      .filter((m) => m.health === "blocked" || m.blocked_tasks > 0)
      .reduce((s, m) => s + (m.cost_allocated_cents ?? 0), 0),
  };

  // ---------- next best action ----------

  const nba = pickNextBestAction(milestones, openBlockers, openApprovals);

  // ---------- captain brief ----------

  const lastChange = inputs.activity[0] ?? null;
  const captainBrief: WorkCaptainBrief = {
    what_changed: lastChange ? lastChange.title : "No material change recorded in the last 24h.",
    what_matters_now:
      nba?.why_it_matters ?? "Work is flowing. Keep active milestones on their gates.",
    recommendation:
      nba?.action ?? "Focus review on the earliest-due active milestone.",
    watch_for:
      openBlockers.length > 0
        ? `${openBlockers.length} open blocker${openBlockers.length === 1 ? "" : "s"} could delay downstream milestones.`
        : "No blockers surfaced. Keep evidence current so QA handoff stays on track.",
  };

  // ---------- health rollup ----------

  const workHealth: WorkHealth = milestones.some((m) => m.health === "blocked")
    ? "blocked"
    : milestones.some((m) => m.health === "at_risk")
      ? "at_risk"
      : milestones.some((m) => m.health === "needs_attention")
        ? "needs_attention"
        : "on_track";

  // ---------- cost & capacity ----------

  const mtdSpend = inputs.agent_tasks.reduce((s, a) => s + a.cost_cents, 0);
  const burnPerDay = Math.round(mtdSpend / Math.max(1, new Date(now).getDate()));
  const allocated = milestones.reduce((s, m) => s + (m.cost_allocated_cents ?? 0), 0);

  const changes: MaterialChange[] = inputs.activity.slice(0, 20).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    actor: a.actor_email,
    severity: a.severity,
    created_at: a.created_at,
  }));

  const mode: ProjectWorkReadModel["mode"] =
    queue.length === 0 && agents.length === 0 ? "no_active_work" : "active";

  return {
    project: inputs.project,
    mode,
    execution_phase: milestones.find((m) => m.work_state === "in_build")?.phase ?? milestones[0]?.phase ?? null,
    current_version_label: inputs.approved_version_label,
    last_material_change: changes[0] ?? null,
    work_health: workHealth,
    summary,
    next_best_action: nba,
    captain_brief: captainBrief,
    milestones,
    queue,
    off_roadmap: offRoadmap,
    agents,
    blockers: openBlockers,
    approvals: openApprovals,
    changes,
    cost: {
      mtd_spend_cents: mtdSpend,
      burn_per_day_cents: burnPerDay,
      value_blocked_cents: summary.value_blocked_cents,
      allocated_cents: allocated,
    },
    capacity: {
      active_agents: activeAgents,
      active_humans: queue.filter((w) => w.owner_type === "human" && w.status === "in_progress")
        .length,
      capacity_load_pct: Math.min(100, Math.round((activeAgents / Math.max(1, agents.length)) * 100)),
      waiting_count: agents.filter((a) => a.state === "waiting" || a.state === "needs_clarification").length,
    },
    qa_handoffs: qaHandoffs,
  };
}

function pickNextBestAction(
  milestones: MilestoneExecutionSummary[],
  blockers: WorkBlocker[],
  approvals: WorkApproval[],
): WorkNextBestAction {
  const scoreBlocker = (b: WorkBlocker) =>
    (b.impact === "critical" ? 6 : b.impact === "high" ? 4 : b.impact === "medium" ? 2 : 1) +
    Math.min(5, b.age_days) +
    (b.blocker_type === "client_dependency" ? 2 : 0);
  const rankedBlockers = [...blockers].sort((a, b) => scoreBlocker(b) - scoreBlocker(a));
  if (rankedBlockers[0]) {
    const b = rankedBlockers[0];
    return {
      action: `Resolve ${b.title}`,
      milestone_id: b.milestone_id,
      milestone_name: b.milestone_name,
      why_it_matters: `Blocking ${b.what_it_blocks}. Waiting ${b.age_days}d.`,
      what_it_unlocks: b.what_it_blocks,
      owner: b.owner,
      due_date: b.due_date,
      impact: b.impact,
      cta_label: "Open Blocker",
      cta_kind: "resolve_blocker",
    };
  }
  const readyMockup = milestones.find((m) => m.work_state === "mockups_in_review");
  if (readyMockup) {
    return {
      action: `Approve mockups: ${readyMockup.name}`,
      milestone_id: readyMockup.id,
      milestone_name: readyMockup.name,
      why_it_matters: "Build cannot start until mockups are approved.",
      what_it_unlocks: "Build gate",
      owner: readyMockup.owner,
      due_date: readyMockup.due_date,
      impact: "high",
      cta_label: "Review Mockups",
      cta_kind: "review_approval",
    };
  }
  const readyForQa = milestones.find((m) => m.ready_for_qa);
  if (readyForQa) {
    return {
      action: `Send ${readyForQa.name} to QA`,
      milestone_id: readyForQa.id,
      milestone_name: readyForQa.name,
      why_it_matters: "All build packets accepted; QA plan ready.",
      what_it_unlocks: "QA & Delivery",
      owner: readyForQa.owner,
      due_date: readyForQa.due_date,
      impact: "high",
      cta_label: "Send to QA",
      cta_kind: "open_milestone",
    };
  }
  if (approvals[0]) {
    return {
      action: approvals[0].title,
      milestone_id: null,
      milestone_name: null,
      why_it_matters: `Unlocks ${approvals[0].what_it_unlocks}.`,
      what_it_unlocks: approvals[0].what_it_unlocks,
      owner: approvals[0].approver,
      due_date: approvals[0].due_date,
      impact: approvals[0].impact,
      cta_label: "Review Approval",
      cta_kind: "review_approval",
    };
  }
  return null;
}

function emptyReadModel(
  inputs: WorkViewInputs,
  mode: ProjectWorkReadModel["mode"],
): ProjectWorkReadModel {
  return {
    project: inputs.project,
    mode,
    execution_phase: null,
    current_version_label: inputs.approved_version_label,
    last_material_change: null,
    work_health: "on_track",
    summary: {
      ready_to_start: 0,
      in_progress: 0,
      blocked: 0,
      awaiting_approval: 0,
      awaiting_client: 0,
      ready_for_qa: 0,
      active_agents: 0,
      value_blocked_cents: 0,
    },
    next_best_action: null,
    captain_brief: {
      what_changed:
        mode === "no_roadmap"
          ? "Roadmap has not been approved."
          : "Roadmap approved; no milestone is ready for execution.",
      what_matters_now:
        mode === "no_roadmap"
          ? "Approve the roadmap baseline before Work can open."
          : "Complete acceptance criteria on the earliest milestone.",
      recommendation:
        mode === "no_roadmap"
          ? "Open the Roadmap tab and approve the baseline."
          : "Draft criteria on the first upcoming milestone.",
      watch_for: "No active work yet.",
    },
    milestones: [],
    queue: [],
    off_roadmap: [],
    agents: [],
    blockers: [],
    approvals: [],
    changes: [],
    cost: {
      mtd_spend_cents: 0,
      burn_per_day_cents: 0,
      value_blocked_cents: 0,
      allocated_cents: 0,
    },
    capacity: {
      active_agents: 0,
      active_humans: 0,
      capacity_load_pct: 0,
      waiting_count: 0,
    },
    qa_handoffs: [],
  };
}

function humanizeAgentRole(module: string): string {
  const m = module.toLowerCase();
  if (m.includes("develop")) return "Developer Agent";
  if (m.includes("pm") || m.includes("project")) return "Project Manager Agent";
  if (m.includes("qa")) return "QA Agent";
  if (m.includes("design") || m.includes("mockup")) return "Design Agent";
  if (m.includes("captain")) return "Captain";
  if (m.includes("product")) return "Product Manager Agent";
  return "AI Agent";
}

function humanizeAgentKind(kind: string): string {
  const map: Record<string, string> = {
    milestone_brief: "Drafting milestone brief",
    acceptance_criteria: "Refining acceptance criteria",
    lovable_prompt: "Preparing implementation prompt",
    qa_checklist: "Drafting QA checklist",
    missing_decisions: "Surfacing missing decisions",
    update_from_source: "Updating from source",
    version_compare: "Comparing versions",
    risk_estimate: "Estimating risk",
    client_summary: "Preparing client summary",
    free_form: "Free-form work",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}
