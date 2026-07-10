// QA Evidence Review v1 — server functions.
//
// Staff-only (operator/admin). Mirrors QA Factory + Backend Builder:
// mutations flow through supabaseAdmin (RLS blocks direct writes). Every
// mutation writes an audit log row + engine_activity row and verifies
// project + packet scope. Approved reviews are locked (DB trigger also
// enforces this) — only archive is allowed after approval.
//
// Product law:
//   Output is not proof. Evidence is not acceptance. Review is not delivery.
//
// This module NEVER:
//   - accepts / rejects / archives / hands off / marks in-progress the packet
//   - mutates the packet.status column at all
//   - marks any QA test passed
//   - marks the project delivered
//   - publishes to the client portal
//   - deploys or applies migrations
//   - mutates approved upstream payloads (QA plan, backend plan, mockup, frame,
//     implementation plan, roadmap, milestones, tasks)
//
// Approving a QA Evidence Review is NOT the same as accepting the packet.
// It only records that a human operator/admin reviewed the evidence bundle
// and decided the review itself is finalized. Packet acceptance still
// requires the explicit human Accept action in the packet drawer.

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

export type QaEvidenceReviewStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "archived";

export type QaEvidenceReviewVerdict =
  | "pending"
  | "evidence_sufficient"
  | "needs_more_evidence"
  | "needs_owner_decision"
  | "insufficient";

export type QaEvidenceGeneratedBy = "ai" | "human" | "hybrid";

export type QaEvidenceAlignment = {
  test_id: string;
  title: string;
  source: "qa_plan" | "packet" | "implicit";
  evidence_status: "covered" | "partial" | "missing";
  notes: string;
};

export type QaEvidencePresent = {
  kind:
    | "log"
    | "diff_summary"
    | "screenshot"
    | "file_reference"
    | "url"
    | "note"
    | "qa_report"
    | "artifact"
    | "other";
  title: string;
  source: "openclaw_run" | "build_evidence" | "external" | "operator_note";
  ref: string | null;
  summary: string;
};

export type QaEvidenceRisk = {
  name: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
};

export type QaEvidenceOpenQuestion = {
  question: string;
  blocks: Array<"build" | "delivery" | "security" | "acceptance">;
  recommended_owner: string;
};

export type QaEvidenceRecommendedNext =
  | "add_more_evidence"
  | "decide_with_operator"
  | "operator_accept_packet"
  | "operator_reject_packet"
  | "return_for_rework";

export type QaEvidenceReviewPayload = {
  review_goal: string;
  packet_summary: string;
  qa_alignment: QaEvidenceAlignment[];
  evidence_expected: string[];
  evidence_present: QaEvidencePresent[];
  evidence_gaps: string[];
  risks: QaEvidenceRisk[];
  open_questions: QaEvidenceOpenQuestion[];
  operator_decisions_required: string[];
  advisory_notes: string[];
  verdict_rationale: string;
  recommended_next_step: QaEvidenceRecommendedNext;
  reminders: string[];
};

export type QaEvidenceReviewRow = {
  id: string;
  project_id: string;
  build_packet_id: string;
  openclaw_run_id: string | null;
  title: string;
  summary: string | null;
  status: QaEvidenceReviewStatus;
  verdict: QaEvidenceReviewVerdict;
  generated_by: QaEvidenceGeneratedBy;
  payload: QaEvidenceReviewPayload;
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
  "Output is not proof.",
  "Evidence is not acceptance.",
  "Review is not delivery.",
  "Approving this review does NOT accept the packet.",
  "Packet acceptance requires the explicit human Accept action.",
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

async function loadPacket(sb: Sb, projectId: string, packetId: string) {
  const { data, error } = await sb
    .from("engine_project_build_packets")
    .select("*")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load packet");
  if (!data) throw new Error("Build packet not found");
  if (data.project_id !== projectId) throw new Error("Project scope mismatch");
  return data as {
    id: string;
    project_id: string;
    title: string;
    summary: string | null;
    status: string;
    packet_type: string;
    sequence_number: number;
    payload: Record<string, unknown>;
  };
}

async function loadReview(sb: Sb, reviewId: string): Promise<QaEvidenceReviewRow> {
  const { data, error } = await sb
    .from("engine_project_qa_evidence_reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load QA evidence review");
  if (!data) throw new Error("QA evidence review not found");
  return data as QaEvidenceReviewRow;
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
    buildPacketId?: string | null;
    reviewId?: string | null;
    openclawRunId?: string | null;
    success?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    extraMetadata?: Record<string, unknown>;
  },
) {
  try {
    const metadata: Record<string, unknown> = {
      build_packet_id: args.buildPacketId ?? null,
      qa_evidence_review_id: args.reviewId ?? null,
      openclaw_run_id: args.openclawRunId ?? null,
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
      target_id: args.reviewId ?? args.buildPacketId ?? null,
      affected_modules: ["build_execution", "qa_evidence_review"],
      metadata,
    });
  } catch {
    /* audit is best-effort */
  }
}

function normalizePayload(
  raw: Partial<QaEvidenceReviewPayload> & Record<string, unknown>,
): QaEvidenceReviewPayload {
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const alignments: QaEvidenceAlignment[] = (
    Array.isArray(raw.qa_alignment) ? raw.qa_alignment : []
  ).map((a, i) => {
    const aa = a as Partial<QaEvidenceAlignment>;
    return {
      test_id: (aa.test_id as string) || `E-${String(i + 1).padStart(3, "0")}`,
      title: (aa.title as string) ?? "",
      source: (["qa_plan", "packet", "implicit"].includes(aa.source as string)
        ? aa.source
        : "implicit") as QaEvidenceAlignment["source"],
      evidence_status: (["covered", "partial", "missing"].includes(
        aa.evidence_status as string,
      )
        ? aa.evidence_status
        : "missing") as QaEvidenceAlignment["evidence_status"],
      notes: (aa.notes as string) ?? "",
    };
  });

  const KIND = new Set([
    "log",
    "diff_summary",
    "screenshot",
    "file_reference",
    "url",
    "note",
    "qa_report",
    "artifact",
    "other",
  ]);
  const SRC = new Set([
    "openclaw_run",
    "build_evidence",
    "external",
    "operator_note",
  ]);
  const evidence_present: QaEvidencePresent[] = (
    Array.isArray(raw.evidence_present) ? raw.evidence_present : []
  ).map((e) => {
    const ee = e as Partial<QaEvidencePresent>;
    return {
      kind: (KIND.has(ee.kind as string)
        ? ee.kind
        : "other") as QaEvidencePresent["kind"],
      title: (ee.title as string) ?? "",
      source: (SRC.has(ee.source as string)
        ? ee.source
        : "external") as QaEvidencePresent["source"],
      ref: (ee.ref as string) ?? null,
      summary: (ee.summary as string) ?? "",
    };
  });

  const risks: QaEvidenceRisk[] = (Array.isArray(raw.risks) ? raw.risks : []).map(
    (r) => {
      const rr = r as Partial<QaEvidenceRisk>;
      return {
        name: rr.name ?? "",
        severity: (["low", "medium", "high"].includes(rr.severity as string)
          ? rr.severity
          : "medium") as QaEvidenceRisk["severity"],
        mitigation: rr.mitigation ?? "",
      };
    },
  );

  const open_questions: QaEvidenceOpenQuestion[] = (
    Array.isArray(raw.open_questions) ? raw.open_questions : []
  ).map((q) => {
    const qq = q as Partial<QaEvidenceOpenQuestion>;
    const allowed = new Set(["build", "delivery", "security", "acceptance"]);
    return {
      question: qq.question ?? "",
      blocks: ((qq.blocks ?? []) as string[]).filter((b) =>
        allowed.has(b),
      ) as QaEvidenceOpenQuestion["blocks"],
      recommended_owner: qq.recommended_owner ?? "",
    };
  });

  const NEXT = new Set([
    "add_more_evidence",
    "decide_with_operator",
    "operator_accept_packet",
    "operator_reject_packet",
    "return_for_rework",
  ]);

  const modelReminders = strList(raw.reminders);
  const reminders = Array.from(
    new Set<string>([...PRODUCT_LAW_REMINDERS, ...modelReminders]),
  ).slice(0, 20);

  return {
    review_goal: (raw.review_goal as string) ?? "",
    packet_summary: (raw.packet_summary as string) ?? "",
    qa_alignment: alignments,
    evidence_expected: strList(raw.evidence_expected),
    evidence_present,
    evidence_gaps: strList(raw.evidence_gaps),
    risks,
    open_questions,
    operator_decisions_required: strList(raw.operator_decisions_required),
    advisory_notes: strList(raw.advisory_notes),
    verdict_rationale: (raw.verdict_rationale as string) ?? "",
    recommended_next_step: (NEXT.has(raw.recommended_next_step as string)
      ? raw.recommended_next_step
      : "decide_with_operator") as QaEvidenceRecommendedNext,
    reminders,
  };
}

function deriveVerdict(payload: QaEvidenceReviewPayload): QaEvidenceReviewVerdict {
  const missing = payload.qa_alignment.filter(
    (a) => a.evidence_status === "missing",
  ).length;
  const partial = payload.qa_alignment.filter(
    (a) => a.evidence_status === "partial",
  ).length;
  const highRisk = payload.risks.filter((r) => r.severity === "high").length;
  const gapsCount = payload.evidence_gaps.length;

  if (missing > 0 || gapsCount >= 3 || highRisk >= 2) return "insufficient";
  if (payload.open_questions.length > 0 || payload.operator_decisions_required.length > 0)
    return "needs_owner_decision";
  if (partial > 0 || gapsCount > 0 || highRisk > 0) return "needs_more_evidence";
  return "evidence_sufficient";
}

// --------------------- getQaEvidenceReview ---------------------

export type QaEvidenceReviewState = {
  project: { id: string; name: string };
  packet: {
    id: string;
    title: string;
    status: string;
    sequence_number: number;
    packet_type: string;
  };
  openclaw_runs: Array<{
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    artifact_count: number;
  }>;
  build_evidence_count: number;
  latest: QaEvidenceReviewRow | null;
  latest_approved: QaEvidenceReviewRow | null;
  history: Array<
    Pick<
      QaEvidenceReviewRow,
      | "id"
      | "title"
      | "status"
      | "verdict"
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

export const getQaEvidenceReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<QaEvidenceReviewState> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;

    const { data: projRow, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load project");
    if (!projRow) throw new Error("Project not found");

    const packet = await loadPacket(sb, data.projectId, data.packetId);

    const { data: reviewRows, error: rErr } = await sb
      .from("engine_project_qa_evidence_reviews")
      .select("*")
      .eq("project_id", data.projectId)
      .eq("build_packet_id", data.packetId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (rErr) throw new Error(rErr.message ?? "Failed to load QA evidence reviews");
    const reviews = (reviewRows ?? []) as QaEvidenceReviewRow[];
    const latest = reviews[0] ?? null;
    const latest_approved = reviews.find((r) => r.status === "approved") ?? null;

    const { data: runsRaw } = await sb
      .from("engine_project_openclaw_runs")
      .select("id,status,started_at,completed_at")
      .eq("build_packet_id", data.packetId)
      .order("started_at", { ascending: false })
      .limit(20);
    const runs = (runsRaw ?? []) as Array<{
      id: string;
      status: string;
      started_at: string;
      completed_at: string | null;
    }>;
    const artifactCounts = new Map<string, number>();
    if (runs.length > 0) {
      const { data: artRows } = await sb
        .from("engine_project_openclaw_artifacts")
        .select("openclaw_run_id")
        .in(
          "openclaw_run_id",
          runs.map((r) => r.id),
        );
      for (const a of (artRows ?? []) as Array<{ openclaw_run_id: string }>) {
        artifactCounts.set(
          a.openclaw_run_id,
          (artifactCounts.get(a.openclaw_run_id) ?? 0) + 1,
        );
      }
    }

    const { count: evidenceCount } = await sb
      .from("engine_project_build_evidence")
      .select("id", { count: "exact", head: true })
      .eq("build_packet_id", data.packetId);

    return {
      project: { id: projRow.id, name: projRow.name ?? "" },
      packet: {
        id: packet.id,
        title: packet.title,
        status: packet.status,
        sequence_number: packet.sequence_number,
        packet_type: packet.packet_type,
      },
      openclaw_runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        artifact_count: artifactCounts.get(r.id) ?? 0,
      })),
      build_evidence_count: evidenceCount ?? 0,
      latest,
      latest_approved,
      history: reviews.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        verdict: r.verdict,
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

// --------------------- generateQaEvidenceReview ---------------------

export const generateQaEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ review: QaEvidenceReviewRow; message?: string }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const packet = await loadPacket(sb, data.projectId, data.packetId);

      // Gather evidence context
      const { data: runsRaw } = await sb
        .from("engine_project_openclaw_runs")
        .select("id,status,started_at,completed_at,output_summary,error_message")
        .eq("build_packet_id", data.packetId)
        .order("started_at", { ascending: false })
        .limit(10);
      const runs = (runsRaw ?? []) as Array<{
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        output_summary: string | null;
        error_message: string | null;
      }>;
      const latestRun = runs[0] ?? null;

      const { data: artRows } = await sb
        .from("engine_project_openclaw_artifacts")
        .select("artifact_type,title,summary,openclaw_run_id")
        .eq("build_packet_id", data.packetId)
        .order("created_at", { ascending: false })
        .limit(30);
      const artifacts = (artRows ?? []) as Array<{
        artifact_type: string;
        title: string;
        summary: string | null;
        openclaw_run_id: string;
      }>;

      const { data: evRows } = await sb
        .from("engine_project_build_evidence")
        .select("evidence_type,title,summary,created_by_email,created_at")
        .eq("build_packet_id", data.packetId)
        .order("created_at", { ascending: false })
        .limit(30);
      const evidence = (evRows ?? []) as Array<{
        evidence_type: string;
        title: string;
        summary: string | null;
        created_by_email: string | null;
        created_at: string;
      }>;

      // Latest approved QA plan for alignment (optional).
      const { data: qaPlanRow } = await sb
        .from("engine_project_qa_plans")
        .select("id,title,payload")
        .eq("project_id", data.projectId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const qaPlan = qaPlanRow as
        | {
            id: string;
            title: string;
            payload: { test_matrix?: Array<{ id: string; title: string; blocking?: boolean }> };
          }
        | null;

      const bundle = {
        product_law: PRODUCT_LAW_REMINDERS,
        project_id: data.projectId,
        packet: {
          id: packet.id,
          title: packet.title,
          summary: packet.summary ?? "",
          status: packet.status,
          packet_type: packet.packet_type,
          scope:
            (packet.payload as { execution_scope?: unknown } | null)
              ?.execution_scope ?? null,
          acceptance_criteria:
            (packet.payload as { acceptance_criteria?: unknown } | null)
              ?.acceptance_criteria ?? null,
        },
        openclaw_runs: runs.map((r) => ({
          id: r.id,
          status: r.status,
          started_at: r.started_at,
          completed_at: r.completed_at,
          output_summary: r.output_summary?.slice(0, 800) ?? null,
          error_message: r.error_message?.slice(0, 400) ?? null,
        })),
        openclaw_artifacts: artifacts.map((a) => ({
          type: a.artifact_type,
          title: a.title,
          summary: (a.summary ?? "").slice(0, 400),
          run_id: a.openclaw_run_id,
        })),
        build_evidence: evidence.map((e) => ({
          type: e.evidence_type,
          title: e.title,
          summary: (e.summary ?? "").slice(0, 400),
          by: e.created_by_email,
          at: e.created_at,
        })),
        qa_plan: qaPlan
          ? {
              id: qaPlan.id,
              title: qaPlan.title,
              test_matrix: (qaPlan.payload?.test_matrix ?? [])
                .slice(0, 40)
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  blocking: !!t.blocking,
                })),
            }
          : null,
      };

      const system = `You are a QA Evidence Reviewer for one build packet inside Trust Tai's internal engine.

You do NOT execute tests. You do NOT accept packets. You do NOT mark tests passed. You do NOT deliver projects. You do NOT publish to the client portal. You NEVER change the packet status.

Your job is to inspect the evidence bundle provided in the next message and produce a structured advisory review that helps a human operator decide their next step.

Product law you must reinforce in the "reminders" field:
- Output is not proof.
- Evidence is not acceptance.
- Review is not delivery.

Return valid JSON matching this exact shape (no prose outside JSON):
{
  "title": string,
  "summary": string,
  "review_goal": string,
  "packet_summary": string,
  "qa_alignment": Array<{"test_id": string, "title": string, "source": "qa_plan"|"packet"|"implicit", "evidence_status": "covered"|"partial"|"missing", "notes": string}>,
  "evidence_expected": string[],
  "evidence_present": Array<{"kind": "log"|"diff_summary"|"screenshot"|"file_reference"|"url"|"note"|"qa_report"|"artifact"|"other", "title": string, "source": "openclaw_run"|"build_evidence"|"external"|"operator_note", "ref": string|null, "summary": string}>,
  "evidence_gaps": string[],
  "risks": Array<{"name": string, "severity": "low"|"medium"|"high", "mitigation": string}>,
  "open_questions": Array<{"question": string, "blocks": Array<"build"|"delivery"|"security"|"acceptance">, "recommended_owner": string}>,
  "operator_decisions_required": string[],
  "advisory_notes": string[],
  "verdict_rationale": string,
  "recommended_next_step": "add_more_evidence"|"decide_with_operator"|"operator_accept_packet"|"operator_reject_packet"|"return_for_rework",
  "reminders": string[]
}

Guidelines:
- Ground every claim in the bundle. Never invent evidence, run IDs, artifact titles, or QA test IDs.
- If the QA plan is provided, populate qa_alignment for each blocking test the packet touches.
- If evidence is thin or missing for a test, mark it "missing" or "partial" — do NOT mark tests as covered without an artifact.
- "recommended_next_step" is advice only. It never accepts, rejects, or delivers anything.
- Always include the product-law reminders.`;

      const user = `EVIDENCE_BUNDLE:\n${JSON.stringify(bundle)}`;

      const { callLovableAi, parseJsonOutput } = await import(
        "@/lib/engine-ai.server"
      );
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );

      const parsed = parseJsonOutput<
        { title?: string; summary?: string } & Partial<QaEvidenceReviewPayload>
      >(ai.text);
      if (!parsed) {
        await insertAuditLog(sb, {
          projectId: data.projectId,
          actorEmail: staff.email,
          action: "qa_evidence_review_generation_failed",
          summary: "AI returned invalid JSON for QA evidence review.",
          buildPacketId: packet.id,
          success: false,
          errorCode: "invalid_json",
        });
        throw new Error("AI returned invalid JSON for the QA evidence review.");
      }

      const payload = normalizePayload(parsed);
      const verdict = deriveVerdict(payload);
      const title = (
        parsed.title ??
        `QA Evidence Review · Packet #${packet.sequence_number} · ${packet.title}`
      ).slice(0, 200);
      const summary = (parsed.summary ?? payload.verdict_rationale ?? "").slice(
        0,
        2000,
      );

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("engine_project_qa_evidence_reviews")
        .insert({
          project_id: data.projectId,
          build_packet_id: packet.id,
          openclaw_run_id: latestRun?.id ?? null,
          title,
          summary,
          status: "draft",
          verdict,
          generated_by: "ai",
          payload,
          created_by_email: staff.email,
          created_by_user_id: staff.userId,
        })
        .select("*")
        .single();
      if (insErr) {
        throw new Error(
          insErr.message ?? "Failed to save QA evidence review draft",
        );
      }

      await insertAuditLog(sb, {
        projectId: data.projectId,
        actorEmail: staff.email,
        action: "qa_evidence_review_generated",
        summary: `Generated QA evidence review draft (verdict: ${verdict}) for packet ${packet.title.slice(0, 80)}.`,
        buildPacketId: packet.id,
        reviewId: (inserted as QaEvidenceReviewRow).id,
        openclawRunId: latestRun?.id ?? null,
        extraMetadata: {
          verdict,
          qa_alignment_count: payload.qa_alignment.length,
          missing_count: payload.qa_alignment.filter(
            (a) => a.evidence_status === "missing",
          ).length,
          gaps_count: payload.evidence_gaps.length,
          recommended_next_step: payload.recommended_next_step,
        },
      });
      await insertActivity(
        sb,
        data.projectId,
        "qa_evidence_review_generated",
        `QA evidence review drafted`,
        `${staff.email} generated a QA evidence review draft (verdict: ${verdict}) for packet "${packet.title.slice(0, 80)}". Review is advisory — packet acceptance still requires a human Accept.`,
      );

      return { review: inserted as QaEvidenceReviewRow };
    },
  );

// --------------------- saveQaEvidenceReviewDraft ---------------------

const QaEvidenceReviewPayloadSchema: z.ZodType<QaEvidenceReviewPayload> = z
  .object({
    review_goal: z.string().default(""),
    packet_summary: z.string().default(""),
    qa_alignment: z.array(z.any()).default([]),
    evidence_expected: z.array(z.string()).default([]),
    evidence_present: z.array(z.any()).default([]),
    evidence_gaps: z.array(z.string()).default([]),
    risks: z.array(z.any()).default([]),
    open_questions: z.array(z.any()).default([]),
    operator_decisions_required: z.array(z.string()).default([]),
    advisory_notes: z.array(z.string()).default([]),
    verdict_rationale: z.string().default(""),
    recommended_next_step: z
      .enum([
        "add_more_evidence",
        "decide_with_operator",
        "operator_accept_packet",
        "operator_reject_packet",
        "return_for_rework",
      ])
      .default("decide_with_operator"),
    reminders: z.array(z.string()).default([]),
  })
  .passthrough() as unknown as z.ZodType<QaEvidenceReviewPayload>;

export const saveQaEvidenceReviewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        reviewId: uuid,
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        payload: QaEvidenceReviewPayloadSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: QaEvidenceReviewRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.projectId, data.packetId);
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.build_packet_id !== data.packetId)
      throw new Error("Packet scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(
        `Cannot edit QA evidence review in status ${existing.status}; only drafts are editable.`,
      );
    }

    const payload = normalizePayload(data.payload as QaEvidenceReviewPayload);
    const verdict = deriveVerdict(payload);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_evidence_reviews")
      .update({
        title: data.title,
        summary: data.summary ?? null,
        payload,
        verdict,
        generated_by:
          existing.generated_by === "ai" ? "hybrid" : existing.generated_by,
      })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error)
      throw new Error(error.message ?? "Failed to update QA evidence review draft");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "qa_evidence_review_draft_updated",
      summary: `Updated QA evidence review draft "${data.title.slice(0, 80)}" (verdict: ${verdict}).`,
      buildPacketId: packet.id,
      reviewId: data.reviewId,
      extraMetadata: { verdict },
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_evidence_review_draft_updated",
      `QA evidence review draft updated`,
      `${staff.email} updated the QA evidence review for packet "${packet.title.slice(0, 80)}".`,
    );
    return { review: upd as QaEvidenceReviewRow };
  });

// --------------------- submitQaEvidenceReview ---------------------

export const submitQaEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid, reviewId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: QaEvidenceReviewRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.projectId, data.packetId);
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.build_packet_id !== data.packetId)
      throw new Error("Packet scope mismatch");
    if (existing.status !== "draft") {
      throw new Error(
        `Review must be a draft to submit; currently ${existing.status}.`,
      );
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_evidence_reviews")
      .update({ status: "in_review" })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error)
      throw new Error(error.message ?? "Failed to submit QA evidence review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "qa_evidence_review_submitted",
      summary: `Submitted QA evidence review "${existing.title.slice(0, 80)}" for review.`,
      buildPacketId: packet.id,
      reviewId: data.reviewId,
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_evidence_review_submitted",
      `QA evidence review submitted`,
      `${staff.email} submitted a QA evidence review for packet "${packet.title.slice(0, 80)}".`,
    );
    return { review: upd as QaEvidenceReviewRow };
  });

// --------------------- approveQaEvidenceReview ---------------------

export const approveQaEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        reviewId: uuid,
        acknowledgement: z.string().trim().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: QaEvidenceReviewRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.projectId, data.packetId);
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.build_packet_id !== data.packetId)
      throw new Error("Packet scope mismatch");
    if (existing.status !== "in_review") {
      throw new Error(
        `Review must be in_review to approve; currently ${existing.status}.`,
      );
    }

    const nowIso = new Date().toISOString();
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_evidence_reviews")
      .update({
        status: "approved",
        approved_by_email: staff.email,
        approved_by_user_id: staff.userId,
        approved_at: nowIso,
      })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error)
      throw new Error(error.message ?? "Failed to approve QA evidence review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "qa_evidence_review_approved",
      summary: `Approved QA evidence review "${existing.title.slice(0, 80)}" (verdict: ${existing.verdict}). Packet NOT accepted.`,
      buildPacketId: packet.id,
      reviewId: data.reviewId,
      extraMetadata: {
        verdict: existing.verdict,
        acknowledgement: data.acknowledgement ?? null,
        packet_status_unchanged: packet.status,
      },
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_evidence_review_approved",
      `QA evidence review approved`,
      `${staff.email} approved the QA evidence review for packet "${packet.title.slice(0, 80)}" (verdict: ${existing.verdict}). This does NOT accept the packet — packet acceptance still requires the human Accept action.`,
    );
    return { review: upd as QaEvidenceReviewRow };
  });

// --------------------- rejectQaEvidenceReview ---------------------

export const rejectQaEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        reviewId: uuid,
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: QaEvidenceReviewRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.projectId, data.packetId);
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.build_packet_id !== data.packetId)
      throw new Error("Packet scope mismatch");
    if (existing.status !== "in_review") {
      throw new Error(
        `Review must be in_review to reject; currently ${existing.status}.`,
      );
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_evidence_reviews")
      .update({ status: "rejected", rejected_reason: data.reason })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error)
      throw new Error(error.message ?? "Failed to reject QA evidence review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "qa_evidence_review_rejected",
      summary: `Rejected QA evidence review "${existing.title.slice(0, 80)}": ${data.reason.slice(0, 200)}`,
      buildPacketId: packet.id,
      reviewId: data.reviewId,
      extraMetadata: { reason: data.reason },
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_evidence_review_rejected",
      `QA evidence review rejected`,
      `${staff.email} rejected the QA evidence review for packet "${packet.title.slice(0, 80)}". Reason: ${data.reason.slice(0, 200)}`,
      "warn",
    );
    return { review: upd as QaEvidenceReviewRow };
  });

// --------------------- archiveQaEvidenceReview ---------------------

export const archiveQaEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid, reviewId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ review: QaEvidenceReviewRow }> => {
    const staff = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.projectId, data.packetId);
    const existing = await loadReview(sb, data.reviewId);
    if (existing.project_id !== data.projectId)
      throw new Error("Project scope mismatch");
    if (existing.build_packet_id !== data.packetId)
      throw new Error("Packet scope mismatch");
    if (existing.status === "archived") return { review: existing };

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_qa_evidence_reviews")
      .update({ status: "archived" })
      .eq("id", data.reviewId)
      .select("*")
      .single();
    if (error)
      throw new Error(error.message ?? "Failed to archive QA evidence review");

    await insertAuditLog(sb, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "qa_evidence_review_archived",
      summary: `Archived QA evidence review "${existing.title.slice(0, 80)}".`,
      buildPacketId: packet.id,
      reviewId: data.reviewId,
    });
    await insertActivity(
      sb,
      data.projectId,
      "qa_evidence_review_archived",
      `QA evidence review archived`,
      `${staff.email} archived the QA evidence review for packet "${packet.title.slice(0, 80)}".`,
    );
    return { review: upd as QaEvidenceReviewRow };
  });
