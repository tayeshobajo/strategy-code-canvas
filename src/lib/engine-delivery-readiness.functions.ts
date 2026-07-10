// Delivery Readiness v1 — server functions (OpenClaw v6).
//
// Assessment layer only. This module NEVER:
//   - accepts / rejects / archives / hands off build packets
//   - mutates packet.status or any upstream approved payload
//   - marks any QA test passed
//   - marks the project delivered
//   - publishes to the client portal
//   - notifies the client
//   - deploys or applies migrations
//   - starts / advances the OpenClaw queue or runs the monitor tick
//
// Product law reinforced in every review:
//   Readiness is not delivery. Assessment is not publication. Approval is not notification.
//
// Staff-only (operator/admin). Mutations flow through supabaseAdmin
// (RLS blocks direct writes). Every mutation writes an audit_log row +
// engine_activity row. Approve/Reject/Archive are admin-gated.
// Approved reviews are protected from silent overwrite by a DB trigger.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type StaffContext = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

// --------------------- types ---------------------

export type DeliveryReadinessStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "archived";

export type DeliveryReadiness =
  | "not_ready"
  | "needs_review"
  | "ready_for_delivery_package"
  | "blocked";

export type DeliveryReadinessRecommendation =
  | "hold"
  | "request_more_work"
  | "prepare_delivery_package"
  | "escalate_to_operator";

export type DeliveryReadinessConfidence = "low" | "medium" | "high";
export type DeliveryReadinessGeneratedBy = "ai" | "human" | "hybrid";

export type DeliveryReadinessPayload = {
  review_goal: string;
  project_summary: string;
  readiness_summary: string;
  packet_readiness: {
    total_packets: number;
    accepted_packets: number;
    qa_required_packets: number;
    rejected_packets: number;
    in_progress_packets: number;
    missing_acceptance: Array<{ id: string; title: string; status: string }>;
  };
  qa_evidence_readiness: {
    approved_reviews: number;
    reviews_needing_more_evidence: number;
    reviews_needing_owner_decision: number;
    missing_reviews: Array<{ packet_id: string; packet_title: string; packet_status: string }>;
    blocking_reviews: Array<{ review_id: string; packet_id: string; verdict: string; title: string }>;
  };
  qa_plan_alignment: Array<{
    qa_item: string;
    status: "satisfied" | "missing" | "partial" | "unclear";
    evidence: string[];
    blocking: boolean;
    notes: string;
  }>;
  implementation_gate_alignment: Array<{
    gate: string;
    status: "satisfied" | "missing" | "partial" | "unclear";
    source: "implementation_plan" | "build_packet" | "qa_review" | "monitor";
    blocking: boolean;
    notes: string;
  }>;
  monitor_findings: {
    critical_events: Array<{ id: string; kind: string; summary: string }>;
    warning_events: Array<{ id: string; kind: string; summary: string }>;
    unacknowledged_events: Array<{ id: string; kind: string; summary: string; severity: string }>;
    stale_runs: string[];
    timed_out_runs: string[];
    failed_runs: string[];
  };
  client_facing_readiness: {
    client_safe_summary_ready: boolean;
    screenshots_ready: boolean;
    change_summary_ready: boolean;
    known_limitations_ready: boolean;
    handoff_notes_ready: boolean;
    blocked_items: string[];
  };
  blockers: string[];
  risks: Array<{ name: string; severity: "low" | "medium" | "high"; mitigation: string }>;
  open_decisions: string[];
  missing_artifacts: string[];
  recommended_next_action: string;
  delivery_package_inputs: {
    accepted_packet_ids: string[];
    qa_review_ids: string[];
    evidence_ids: string[];
    screenshots: string[];
    change_summary: string;
    known_limitations: string[];
    handoff_notes: string[];
  };
  reminders: string[];
};

export type DeliveryReadinessRow = {
  id: string;
  project_id: string;
  implementation_plan_id: string | null;
  qa_plan_id: string | null;
  title: string;
  summary: string | null;
  status: DeliveryReadinessStatus;
  readiness: DeliveryReadiness;
  recommendation: DeliveryReadinessRecommendation;
  confidence: DeliveryReadinessConfidence;
  generated_by: DeliveryReadinessGeneratedBy;
  payload: DeliveryReadinessPayload;
  rejected_reason: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  approved_by_user_id: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

// --------------------- helpers ---------------------

const PRODUCT_LAW_REMINDERS = [
  "Readiness is not delivery.",
  "Assessment is not publication.",
  "Approving readiness does NOT mark the project delivered.",
  "Approving readiness does NOT publish to the client portal.",
  "Approving readiness does NOT notify the client.",
  "Approving readiness does NOT mark QA tests passed.",
];

async function assertStaff(ctx: StaffContext) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOperator, isAdmin] = await Promise.all([
    hasRoleForEmail(ctx.supabase, email, "operator"),
    hasRoleForEmail(ctx.supabase, email, "admin"),
  ]);
  if (!isOperator && !isAdmin) {
    throw new Error("Forbidden: operator or admin role required");
  }
  return { email, userId: ctx.userId ?? null, isAdmin, isOperator };
}

async function assertAdmin(ctx: StaffContext) {
  const staff = await assertStaff(ctx);
  if (!staff.isAdmin) throw new Error("Forbidden: admin role required");
  return staff;
}

async function loadReview(sb: Sb, reviewId: string): Promise<DeliveryReadinessRow> {
  const { data, error } = await sb
    .from("engine_project_delivery_readiness_reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load delivery readiness review");
  if (!data) throw new Error("Delivery readiness review not found");
  return data as DeliveryReadinessRow;
}

async function insertActivity(
  sb: Sb,
  projectId: string,
  kind: string,
  title: string,
  body: string,
  severity: "info" | "warn" | "error" = "info",
) {
  try {
    await sb.from("engine_activity").insert({
      project_id: projectId,
      kind,
      title,
      body,
      severity,
    });
  } catch {
    /* best-effort */
  }
}

async function insertAuditLog(
  sb: Sb,
  args: {
    projectId: string;
    actorEmail: string;
    action: string;
    summary: string;
    reviewId?: string | null;
    success?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    extraMetadata?: Record<string, unknown>;
  },
) {
  try {
    const metadata: Record<string, unknown> = {
      delivery_readiness_review_id: args.reviewId ?? null,
      user_email: args.actorEmail,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
      error_message: args.errorMessage
        ? String(args.errorMessage).slice(0, 500)
        : null,
      ...(args.extraMetadata ?? {}),
    };
    await sb.from("engine_audit_log").insert({
      project_id: args.projectId,
      actor_email: args.actorEmail,
      action: args.action,
      summary: args.summary.slice(0, 500),
      target_id: args.reviewId ?? null,
      affected_modules: ["build_execution", "delivery_readiness"],
      metadata,
    });
  } catch {
    /* audit is best-effort */
  }
}

// --------------------- assessment ---------------------

type AssessedFacts = {
  packets: Array<{ id: string; title: string; status: string; sequence_number: number }>;
  reviews: Array<{
    id: string;
    build_packet_id: string;
    status: string;
    verdict: string;
    title: string;
  }>;
  monitor_events: Array<{
    id: string;
    kind: string;
    severity: string;
    summary: string;
    acknowledged_at: string | null;
  }>;
  monitor_settings: { enabled: boolean } | null;
  monitor_load_error: string | null;
  qa_plan: {
    id: string;
    title: string;
    payload: { test_matrix?: Array<{ id: string; title: string; blocking?: boolean }> };
  } | null;
  implementation_plan: {
    id: string;
    title: string;
    payload: {
      execution_sequence?: Array<{ id?: string; title?: string; gate?: string; blocking?: boolean }>;
    };
  } | null;
  openclaw_runs: Array<{ id: string; status: string; error_message: string | null }>;
  evidence_by_packet: Map<string, number>;
  artifact_by_packet: Map<string, number>;
};

async function gatherFacts(sb: Sb, projectId: string): Promise<AssessedFacts> {
  const [
    { data: pkts },
    { data: revs },
    { data: mons },
    { data: monSet },
    { data: qaPlan },
    { data: implPlan },
    { data: runs },
    { data: ev },
    { data: arts },
  ] = await Promise.all([
    sb
      .from("engine_project_build_packets")
      .select("id,title,status,sequence_number")
      .eq("project_id", projectId)
      .order("sequence_number"),
    sb
      .from("engine_project_qa_evidence_reviews")
      .select("id,build_packet_id,status,verdict,title")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    sb
      .from("engine_project_openclaw_monitor_events")
      .select("id,kind,severity,summary,acknowledged_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("engine_project_openclaw_monitor_settings")
      .select("enabled")
      .eq("project_id", projectId)
      .maybeSingle(),
    sb
      .from("engine_project_qa_plans")
      .select("id,title,payload")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("engine_project_implementation_plans")
      .select("id,title,payload")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("engine_project_openclaw_runs")
      .select("id,status,error_message,build_packet_id")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(200),
    sb
      .from("engine_project_build_evidence")
      .select("id,build_packet_id")
      .eq("project_id", projectId),
    sb
      .from("engine_project_openclaw_artifacts")
      .select("id,build_packet_id")
      .eq("project_id", projectId),
  ]);

  const evidence_by_packet = new Map<string, number>();
  for (const e of ((ev ?? []) as Array<{ build_packet_id: string }>)) {
    evidence_by_packet.set(e.build_packet_id, (evidence_by_packet.get(e.build_packet_id) ?? 0) + 1);
  }
  const artifact_by_packet = new Map<string, number>();
  for (const a of ((arts ?? []) as Array<{ build_packet_id: string }>)) {
    artifact_by_packet.set(a.build_packet_id, (artifact_by_packet.get(a.build_packet_id) ?? 0) + 1);
  }

  return {
    packets: (pkts ?? []) as AssessedFacts["packets"],
    reviews: (revs ?? []) as AssessedFacts["reviews"],
    monitor_events: (mons ?? []) as AssessedFacts["monitor_events"],
    monitor_settings: (monSet as AssessedFacts["monitor_settings"]) ?? null,
    qa_plan: (qaPlan as AssessedFacts["qa_plan"]) ?? null,
    implementation_plan: (implPlan as AssessedFacts["implementation_plan"]) ?? null,
    openclaw_runs: (runs ?? []) as AssessedFacts["openclaw_runs"],
    evidence_by_packet,
    artifact_by_packet,
  };
}

type DerivedAssessment = {
  readiness: DeliveryReadiness;
  recommendation: DeliveryReadinessRecommendation;
  confidence: DeliveryReadinessConfidence;
  payload: DeliveryReadinessPayload;
};

function deriveAssessment(facts: AssessedFacts): DerivedAssessment {
  // Packet counts
  const pkts = facts.packets.filter((p) => p.status !== "archived");
  const accepted = pkts.filter((p) => p.status === "accepted");
  const rejected = pkts.filter((p) => p.status === "rejected");
  const inProgress = pkts.filter((p) =>
    ["draft", "ready", "handed_off", "in_progress", "returned"].includes(p.status),
  );
  const qaRequired = pkts.filter((p) => p.status === "qa_required");
  const missing_acceptance = [...rejected, ...inProgress, ...qaRequired].map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
  }));

  // Latest review per packet
  const latestReviewByPacket = new Map<string, AssessedFacts["reviews"][number]>();
  for (const r of facts.reviews) {
    if (!latestReviewByPacket.has(r.build_packet_id)) latestReviewByPacket.set(r.build_packet_id, r);
  }
  const packetsNeedingReview = pkts.filter((p) =>
    ["qa_required", "accepted", "handed_off", "in_progress", "returned"].includes(p.status),
  );
  const missing_reviews = packetsNeedingReview
    .filter((p) => !latestReviewByPacket.has(p.id))
    .map((p) => ({ packet_id: p.id, packet_title: p.title, packet_status: p.status }));

  const approved_reviews = facts.reviews.filter((r) => r.status === "approved").length;
  const needing_more = facts.reviews.filter(
    (r) => r.verdict === "needs_more_evidence" || r.verdict === "insufficient",
  ).length;
  const needing_owner = facts.reviews.filter((r) => r.verdict === "needs_owner_decision").length;
  const blocking_reviews = facts.reviews
    .filter((r) => r.verdict === "insufficient" || r.verdict === "needs_more_evidence")
    .map((r) => ({
      review_id: r.id,
      packet_id: r.build_packet_id,
      verdict: r.verdict,
      title: r.title,
    }));

  // Monitor
  const unacked = facts.monitor_events.filter((e) => !e.acknowledged_at);
  const critical = unacked.filter((e) => e.severity === "critical" || e.severity === "high");
  const warnings = unacked.filter((e) => e.severity === "warning" || e.severity === "warn" || e.severity === "medium");
  const stale = unacked
    .filter((e) => e.kind === "openclaw_run_stale" || e.kind === "openclaw_run_stalled")
    .map((e) => e.id);
  const timed_out = unacked
    .filter((e) => e.kind === "openclaw_run_timed_out")
    .map((e) => e.id);
  const failed_runs = unacked
    .filter(
      (e) => e.kind === "openclaw_run_failed_detected" || e.kind === "openclaw_run_completed_not_returned",
    )
    .map((e) => e.id);

  // QA plan alignment (derived from approved QA plan test matrix)
  const qa_plan_alignment = (facts.qa_plan?.payload?.test_matrix ?? [])
    .slice(0, 40)
    .map((t) => {
      const evidenceFound = facts.reviews.some((r) => r.status === "approved");
      return {
        qa_item: t.title || t.id,
        status: (evidenceFound ? "partial" : "unclear") as
          | "satisfied"
          | "missing"
          | "partial"
          | "unclear",
        evidence: [] as string[],
        blocking: !!t.blocking,
        notes:
          "Derived from approved QA plan; verify manually against QA evidence reviews before approval.",
      };
    });

  // Implementation gate alignment (derived from approved implementation plan)
  const implementation_gate_alignment = (facts.implementation_plan?.payload?.execution_sequence ?? [])
    .slice(0, 40)
    .map((step) => ({
      gate: step.title || step.gate || step.id || "gate",
      status: (accepted.length > 0 ? "partial" : "unclear") as
        | "satisfied"
        | "missing"
        | "partial"
        | "unclear",
      source: "implementation_plan" as const,
      blocking: !!step.blocking,
      notes: "Derived from approved implementation plan; verify against accepted packets.",
    }));

  // Client-facing readiness — conservative, evidence-based
  const hasEvidence = facts.evidence_by_packet.size > 0 || facts.artifact_by_packet.size > 0;
  const client_facing_readiness = {
    client_safe_summary_ready: false,
    screenshots_ready: hasEvidence,
    change_summary_ready: false,
    known_limitations_ready: false,
    handoff_notes_ready: false,
    blocked_items: [
      !hasEvidence ? "No screenshots or artifacts recorded yet." : null,
      "Client-safe change summary not prepared." ,
      "Known limitations not documented.",
      "Handoff notes not written.",
    ].filter((x): x is string => !!x),
  };

  // Blockers
  const blockers: string[] = [];
  if (critical.length > 0) blockers.push(`${critical.length} critical monitor event(s) unacknowledged`);
  if (rejected.length > 0) blockers.push(`${rejected.length} rejected packet(s) need rework`);
  if (missing_reviews.length > 0)
    blockers.push(`${missing_reviews.length} packet(s) missing QA evidence review`);
  if (blocking_reviews.length > 0)
    blockers.push(`${blocking_reviews.length} QA review(s) with insufficient / needs-more-evidence verdicts`);
  if (qaRequired.length > 0) blockers.push(`${qaRequired.length} packet(s) still in qa_required`);
  if (inProgress.length > 0) blockers.push(`${inProgress.length} packet(s) not yet accepted`);
  if (needing_owner > 0) blockers.push(`${needing_owner} review(s) need an owner decision`);

  // Derive readiness — server-side, not model-trusted.
  let readiness: DeliveryReadiness = "not_ready";
  let recommendation: DeliveryReadinessRecommendation = "hold";
  let confidence: DeliveryReadinessConfidence = "low";

  if (critical.length > 0) {
    readiness = "blocked";
    recommendation = "escalate_to_operator";
    confidence = "high";
  } else if (
    pkts.length === 0 ||
    inProgress.length > 0 ||
    rejected.length > 0 ||
    qaRequired.length > 0 ||
    missing_reviews.length > 0 ||
    blocking_reviews.length > 0
  ) {
    readiness = "not_ready";
    recommendation = "request_more_work";
    confidence = pkts.length === 0 ? "low" : "medium";
  } else if (needing_owner > 0 || client_facing_readiness.blocked_items.length > 0) {
    readiness = "needs_review";
    recommendation = "escalate_to_operator";
    confidence = "medium";
  } else if (
    pkts.length > 0 &&
    accepted.length === pkts.length &&
    approved_reviews > 0 &&
    critical.length === 0
  ) {
    readiness = "ready_for_delivery_package";
    recommendation = "prepare_delivery_package";
    confidence = "medium"; // still requires human approval + client-facing prep
  }

  const payload: DeliveryReadinessPayload = {
    review_goal:
      "Assess whether accepted packets, QA evidence reviews, unresolved blockers, and client-facing requirements are complete enough to PREPARE a delivery package. This does NOT deliver.",
    project_summary: "",
    readiness_summary:
      readiness === "ready_for_delivery_package"
        ? "All packets accepted, at least one approved QA evidence review, and no unacknowledged critical monitor events. Human operator must still prepare the client-facing package."
        : blockers.join(" · ") || "Insufficient project data.",
    packet_readiness: {
      total_packets: pkts.length,
      accepted_packets: accepted.length,
      qa_required_packets: qaRequired.length,
      rejected_packets: rejected.length,
      in_progress_packets: inProgress.length,
      missing_acceptance,
    },
    qa_evidence_readiness: {
      approved_reviews,
      reviews_needing_more_evidence: needing_more,
      reviews_needing_owner_decision: needing_owner,
      missing_reviews,
      blocking_reviews,
    },
    qa_plan_alignment,
    implementation_gate_alignment,
    monitor_findings: {
      critical_events: critical.map((e) => ({ id: e.id, kind: e.kind, summary: e.summary })),
      warning_events: warnings.map((e) => ({ id: e.id, kind: e.kind, summary: e.summary })),
      unacknowledged_events: unacked
        .slice(0, 20)
        .map((e) => ({ id: e.id, kind: e.kind, summary: e.summary, severity: e.severity })),
      stale_runs: stale,
      timed_out_runs: timed_out,
      failed_runs,
    },
    client_facing_readiness,
    blockers,
    risks: [],
    open_decisions:
      needing_owner > 0 ? [`${needing_owner} QA review(s) awaiting owner decision`] : [],
    missing_artifacts: !hasEvidence ? ["No screenshots or artifacts recorded for any packet."] : [],
    recommended_next_action:
      recommendation === "prepare_delivery_package"
        ? "Have a human operator open Prepare Delivery Package (v7 — not built yet) once client-facing artifacts are collected. Do NOT publish or notify from here."
        : recommendation === "escalate_to_operator"
          ? "Escalate to operator — critical blockers or owner decisions outstanding."
          : "Resolve blockers listed above; do NOT approve readiness until they are cleared.",
    delivery_package_inputs: {
      accepted_packet_ids: accepted.map((p) => p.id),
      qa_review_ids: facts.reviews.filter((r) => r.status === "approved").map((r) => r.id),
      evidence_ids: [],
      screenshots: [],
      change_summary: "",
      known_limitations: [],
      handoff_notes: [],
    },
    reminders: [...PRODUCT_LAW_REMINDERS],
  };

  return { readiness, recommendation, confidence, payload };
}

function normalizePayload(
  raw: Partial<DeliveryReadinessPayload> & Record<string, unknown>,
  fallback: DeliveryReadinessPayload,
): DeliveryReadinessPayload {
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const merged: DeliveryReadinessPayload = {
    ...fallback,
    ...(raw as Partial<DeliveryReadinessPayload>),
    packet_readiness: fallback.packet_readiness, // derived — do not accept from client
    qa_evidence_readiness: fallback.qa_evidence_readiness,
    monitor_findings: fallback.monitor_findings,
    qa_plan_alignment: fallback.qa_plan_alignment,
    implementation_gate_alignment: fallback.implementation_gate_alignment,
    blockers: fallback.blockers,
    reminders: Array.from(new Set([...PRODUCT_LAW_REMINDERS, ...strList(raw.reminders)])),
  };
  // Client-facing checklist is human-editable.
  if (raw.client_facing_readiness && typeof raw.client_facing_readiness === "object") {
    const cfr = raw.client_facing_readiness as Partial<DeliveryReadinessPayload["client_facing_readiness"]>;
    merged.client_facing_readiness = {
      client_safe_summary_ready: !!cfr.client_safe_summary_ready,
      screenshots_ready: !!cfr.screenshots_ready,
      change_summary_ready: !!cfr.change_summary_ready,
      known_limitations_ready: !!cfr.known_limitations_ready,
      handoff_notes_ready: !!cfr.handoff_notes_ready,
      blocked_items: strList(cfr.blocked_items),
    };
  }
  if (raw.delivery_package_inputs && typeof raw.delivery_package_inputs === "object") {
    const d = raw.delivery_package_inputs as Partial<DeliveryReadinessPayload["delivery_package_inputs"]>;
    merged.delivery_package_inputs = {
      accepted_packet_ids: fallback.delivery_package_inputs.accepted_packet_ids,
      qa_review_ids: fallback.delivery_package_inputs.qa_review_ids,
      evidence_ids: strList(d.evidence_ids),
      screenshots: strList(d.screenshots),
      change_summary: String(d.change_summary ?? "").slice(0, 4000),
      known_limitations: strList(d.known_limitations),
      handoff_notes: strList(d.handoff_notes),
    };
  }
  merged.open_decisions = strList(raw.open_decisions ?? fallback.open_decisions);
  merged.missing_artifacts = strList(raw.missing_artifacts ?? fallback.missing_artifacts);
  merged.review_goal = String(raw.review_goal ?? fallback.review_goal).slice(0, 2000);
  merged.project_summary = String(raw.project_summary ?? fallback.project_summary).slice(0, 4000);
  merged.readiness_summary = String(raw.readiness_summary ?? fallback.readiness_summary).slice(0, 4000);
  merged.recommended_next_action = String(
    raw.recommended_next_action ?? fallback.recommended_next_action,
  ).slice(0, 2000);
  if (Array.isArray(raw.risks)) {
    merged.risks = (raw.risks as Array<Partial<DeliveryReadinessPayload["risks"][number]>>).map((r) => ({
      name: String(r.name ?? "").slice(0, 200),
      severity: (["low", "medium", "high"].includes(r.severity as string)
        ? r.severity
        : "medium") as "low" | "medium" | "high",
      mitigation: String(r.mitigation ?? "").slice(0, 800),
    }));
  }
  return merged;
}

// --------------------- getDeliveryReadiness ---------------------

export type DeliveryReadinessState = {
  project: { id: string; name: string };
  derived: {
    readiness: DeliveryReadiness;
    recommendation: DeliveryReadinessRecommendation;
    confidence: DeliveryReadinessConfidence;
    payload: DeliveryReadinessPayload;
  };
  latest: DeliveryReadinessRow | null;
  latest_approved: DeliveryReadinessRow | null;
  history: Array<
    Pick<
      DeliveryReadinessRow,
      | "id"
      | "title"
      | "status"
      | "readiness"
      | "recommendation"
      | "confidence"
      | "generated_by"
      | "created_by_email"
      | "created_at"
      | "updated_at"
      | "approved_at"
      | "approved_by_email"
    >
  >;
  capabilities: {
    isStaff: boolean;
    isAdmin: boolean;
    canGenerate: boolean;
    canSaveDraft: boolean;
    canSubmitReview: boolean;
    canApprove: boolean;
    canReject: boolean;
    canArchive: boolean;
  };
};

export const getDeliveryReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<DeliveryReadinessState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const { data: projRow, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load project");
    if (!projRow) throw new Error("Project not found");

    const facts = await gatherFacts(sb, data.projectId);
    const derived = deriveAssessment(facts);

    const { data: revs, error: rErr } = await sb
      .from("engine_project_delivery_readiness_reviews")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (rErr) throw new Error(rErr.message ?? "Failed to load delivery readiness reviews");
    const reviews = (revs ?? []) as DeliveryReadinessRow[];

    return {
      project: { id: projRow.id, name: projRow.name ?? "" },
      derived,
      latest: reviews[0] ?? null,
      latest_approved: reviews.find((r) => r.status === "approved") ?? null,
      history: reviews.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        readiness: r.readiness,
        recommendation: r.recommendation,
        confidence: r.confidence,
        generated_by: r.generated_by,
        created_by_email: r.created_by_email,
        created_at: r.created_at,
        updated_at: r.updated_at,
        approved_at: r.approved_at,
        approved_by_email: r.approved_by_email,
      })),
      capabilities: {
        isStaff: true,
        isAdmin: staff.isAdmin,
        canGenerate: true,
        canSaveDraft: true,
        canSubmitReview: true,
        canApprove: staff.isAdmin,
        canReject: staff.isAdmin,
        canArchive: staff.isAdmin,
      },
    };
  });

// --------------------- generateDeliveryReadinessReview ---------------------

export const generateDeliveryReadinessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      const { data: projRow } = await sb
        .from("engine_projects")
        .select("id,name")
        .eq("id", data.projectId)
        .maybeSingle();
      if (!projRow) throw new Error("Project not found");

      const facts = await gatherFacts(sb, data.projectId);
      const derived = deriveAssessment(facts);
      const title = `Delivery Readiness Review · ${projRow.name ?? data.projectId} · ${new Date().toISOString().slice(0, 10)}`;
      const summary = derived.payload.readiness_summary;

      const { data: implRow } = await sb
        .from("engine_project_implementation_plans")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: qaRow } = await sb
        .from("engine_project_qa_plans")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_delivery_readiness_reviews")
        .insert({
          project_id: data.projectId,
          implementation_plan_id: (implRow as { id: string } | null)?.id ?? null,
          qa_plan_id: (qaRow as { id: string } | null)?.id ?? null,
          title,
          summary,
          status: "draft",
          readiness: derived.readiness,
          recommendation: derived.recommendation,
          confidence: derived.confidence,
          generated_by: "ai",
          payload: derived.payload,
          created_by_email: staff.email,
          created_by_user_id: staff.userId,
        })
        .select("*")
        .single();
      if (insErr) {
        await insertAuditLog(sb, {
          projectId: data.projectId,
          actorEmail: staff.email,
          action: "delivery_readiness_generation_failed",
          summary: `Failed to generate delivery readiness review: ${insErr.message ?? "unknown"}`,
          success: false,
          errorCode: "insert_failed",
          errorMessage: insErr.message ?? null,
        });
        throw new Error(insErr.message ?? "Failed to save delivery readiness review");
      }

      await insertAuditLog(sb, {
        projectId: data.projectId,
        actorEmail: staff.email,
        action: "delivery_readiness_generated",
        summary: `Generated delivery readiness review (readiness: ${derived.readiness}, recommendation: ${derived.recommendation}).`,
        reviewId: (inserted as DeliveryReadinessRow).id,
        extraMetadata: {
          readiness: derived.readiness,
          recommendation: derived.recommendation,
          confidence: derived.confidence,
          packet_counts: derived.payload.packet_readiness,
          missing_reviews: derived.payload.qa_evidence_readiness.missing_reviews.length,
          blocker_count: derived.payload.blockers.length,
        },
      });
      await insertActivity(
        sb,
        data.projectId,
        "delivery_readiness_generated",
        `Delivery readiness review drafted`,
        `${staff.email} generated a delivery readiness review (readiness: ${derived.readiness}). This is assessment only — nothing was delivered, published, or announced.`,
      );

      return { review: inserted as DeliveryReadinessRow };
    },
  );

// --------------------- saveDeliveryReadinessReviewDraft ---------------------

const PayloadSchema = z.object({}).passthrough();

export const saveDeliveryReadinessReviewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        reviewId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: PayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(`Cannot edit review in status ${existing.status}; only drafts are editable.`);
    }

    // Re-derive server-side; only accept human-editable client-facing fields.
    const facts = await gatherFacts(sb, data.projectId);
    const derived = deriveAssessment(facts);
    const payload = normalizePayload(
      data.payload as Partial<DeliveryReadinessPayload>,
      derived.payload,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_delivery_readiness_reviews")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload,
        readiness: derived.readiness,
        recommendation: derived.recommendation,
        confidence: derived.confidence,
        generated_by: existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
      })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to save delivery readiness draft");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "delivery_readiness_saved",
      summary: `Saved delivery readiness draft (readiness: ${derived.readiness}).`,
      reviewId: data.reviewId,
      extraMetadata: {
        readiness: derived.readiness,
        recommendation: derived.recommendation,
      },
    });
    await insertActivity(
      sb,
      data.projectId,
      "delivery_readiness_saved",
      `Delivery readiness draft saved`,
      `${staff.email} updated the delivery readiness draft.`,
    );

    return { review: upd as DeliveryReadinessRow };
  });

// --------------------- submitDeliveryReadinessReview ---------------------

export const submitDeliveryReadinessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, reviewId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(`Review must be a draft to submit; currently ${existing.status}.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_delivery_readiness_reviews")
      .update({ status: "in_review" })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to submit delivery readiness review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "delivery_readiness_submitted",
      summary: `Submitted delivery readiness "${existing.title.slice(0, 80)}" for review.`,
      reviewId: data.reviewId,
    });
    await insertActivity(
      sb,
      data.projectId,
      "delivery_readiness_submitted",
      `Delivery readiness submitted`,
      `${staff.email} submitted a delivery readiness review.`,
    );

    return { review: upd as DeliveryReadinessRow };
  });

// --------------------- approveDeliveryReadinessReview ---------------------

export const approveDeliveryReadinessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        reviewId: uuid,
        acknowledgement: z.string().trim().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "in_review") {
      throw new Error(`Review must be in_review to approve; currently ${existing.status}.`);
    }

    // Re-derive to prevent approving stale readiness assessments that lost their evidence.
    const facts = await gatherFacts(sb, data.projectId);
    const derived = deriveAssessment(facts);
    if (
      existing.readiness === "ready_for_delivery_package" &&
      derived.readiness !== "ready_for_delivery_package"
    ) {
      throw new Error(
        `Cannot approve as ready_for_delivery_package: current assessment is ${derived.readiness}. Regenerate the review.`,
      );
    }

    const nowIso = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_delivery_readiness_reviews")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to approve delivery readiness review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "delivery_readiness_approved",
      summary: `Approved delivery readiness "${existing.title.slice(0, 80)}" (readiness: ${existing.readiness}). Project NOT delivered.`,
      reviewId: data.reviewId,
      extraMetadata: {
        readiness: existing.readiness,
        recommendation: existing.recommendation,
        confidence: existing.confidence,
        acknowledgement: data.acknowledgement ?? null,
        project_delivered: false,
        portal_published: false,
        client_notified: false,
      },
    });
    await insertActivity(
      sb,
      data.projectId,
      "delivery_readiness_approved",
      `Delivery readiness approved`,
      `${staff.email} approved the delivery readiness review (${existing.readiness}). This does NOT deliver the project, publish to the portal, notify the client, or mark QA passed.`,
    );

    return { review: upd as DeliveryReadinessRow };
  });

// --------------------- rejectDeliveryReadinessReview ---------------------

export const rejectDeliveryReadinessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        reviewId: uuid,
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status !== "in_review") {
      throw new Error(`Review must be in_review to reject; currently ${existing.status}.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_delivery_readiness_reviews")
      .update({ status: "rejected", rejected_reason: data.reason })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to reject delivery readiness review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "delivery_readiness_rejected",
      summary: `Rejected delivery readiness "${existing.title.slice(0, 80)}": ${data.reason.slice(0, 200)}`,
      reviewId: data.reviewId,
      extraMetadata: { reason: data.reason },
    });
    await insertActivity(
      sb,
      data.projectId,
      "delivery_readiness_rejected",
      `Delivery readiness rejected`,
      `${staff.email} rejected the delivery readiness review. Reason: ${data.reason.slice(0, 200)}`,
      "warn",
    );

    return { review: upd as DeliveryReadinessRow };
  });

// --------------------- archiveDeliveryReadinessReview ---------------------

export const archiveDeliveryReadinessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, reviewId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: DeliveryReadinessRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status === "archived") return { review: existing };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_delivery_readiness_reviews")
      .update({ status: "archived" })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to archive delivery readiness review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "delivery_readiness_archived",
      summary: `Archived delivery readiness "${existing.title.slice(0, 80)}".`,
      reviewId: data.reviewId,
    });
    await insertActivity(
      sb,
      data.projectId,
      "delivery_readiness_archived",
      `Delivery readiness archived`,
      `${staff.email} archived the delivery readiness review.`,
    );

    return { review: upd as DeliveryReadinessRow };
  });
