// OpenClaw Direct Connection v2 — server functions.
//
// Staff-only. Manual-trigger only. This module tracks OpenClaw runs against
// a single build packet at a time. It never runs automatically, batch-runs,
// applies migrations, deploys, marks QA passed, accepts packets, marks
// projects delivered, or publishes to the client portal.
//
// If OPENCLAW_API_URL + OPENCLAW_API_KEY are configured, startOpenClawRun
// posts the controlled packet context to that endpoint. Otherwise we operate
// in manual-tracking mode: the run row records that the packet was sent to
// OpenClaw out-of-band and the operator updates the run manually.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { Json } from "@/lib/engine-workspace";
import type { BuildPacketRow, BuildPacketPayload } from "@/lib/engine-build-execution.functions";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type StaffContext = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

export type OpenClawRunStatus =
  | "queued"
  | "sent"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "returned_for_review";

export type OpenClawArtifactType =
  | "log"
  | "diff_summary"
  | "screenshot"
  | "file_reference"
  | "url"
  | "note"
  | "qa_report";

export type OpenClawRunRow = {
  id: string;
  project_id: string;
  build_packet_id: string;
  implementation_plan_id: string | null;
  status: OpenClawRunStatus;
  provider: "openclaw";
  run_mode: "manual";
  request_payload: Json;
  response_payload: Json;
  output_summary: string | null;
  error_code: string | null;
  error_message: string | null;
  started_by: string | null;
  started_by_email: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OpenClawArtifactRow = {
  id: string;
  project_id: string;
  openclaw_run_id: string;
  build_packet_id: string;
  artifact_type: OpenClawArtifactType;
  title: string;
  summary: string | null;
  payload: Json;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type OpenClawRequestPayload = {
  project_id: string;
  build_packet_id: string;
  packet_title: string;
  packet_goal: string;
  target_builder: string;
  handoff_prompt: string;
  included_scope: string[];
  excluded_scope: string[];
  do_not_touch: string[];
  expected_files_or_surfaces: string[];
  acceptance_criteria: string[];
  qa_requirements: string[];
  evidence_required: string[];
  rollback_notes: string[];
  safety_notes: string[];
};

// ------------------------- helpers -------------------------

async function assertStaff(ctx: StaffContext) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOperator, isAdmin] = await Promise.all([
    hasRoleForEmail(ctx.supabase, email, "operator"),
    hasRoleForEmail(ctx.supabase, email, "admin"),
  ]);
  if (!isOperator && !isAdmin) throw new Error("Forbidden: operator or admin role required");
  return { email, userId: ctx.userId ?? null, isAdmin, isOperator };
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
    await sb.from("engine_activity").insert({ project_id: projectId, kind, title, body, severity });
  } catch {
    /* best-effort */
  }
}

async function insertAudit(
  sb: Sb,
  args: {
    projectId: string;
    userId: string | null;
    email: string;
    eventType: string;
    success?: boolean;
    errorCode?: string | null;
  },
) {
  try {
    await sb.from("engine_project_chat_events").insert({
      project_id: args.projectId,
      user_id: args.userId,
      user_email: args.email,
      thread_id: null,
      message_id: null,
      event_type: args.eventType,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
    });
  } catch {
    /* best-effort */
  }
}

async function loadPacket(sb: Sb, packetId: string): Promise<BuildPacketRow> {
  const { data, error } = await sb
    .from("engine_project_build_packets")
    .select("*")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load build packet");
  if (!data) throw new Error("Build packet not found");
  return data as BuildPacketRow;
}

async function loadRun(sb: Sb, runId: string): Promise<OpenClawRunRow> {
  const { data, error } = await sb
    .from("engine_project_openclaw_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load OpenClaw run");
  if (!data) throw new Error("OpenClaw run not found");
  return data as OpenClawRunRow;
}

function buildRequestPayload(packet: BuildPacketRow): OpenClawRequestPayload {
  const p = (packet.payload ?? {}) as Partial<BuildPacketPayload>;
  const scope = p.execution_scope ?? {
    included: [],
    excluded: [],
    expected_files_or_surfaces: [],
    do_not_touch: [],
  };
  return {
    project_id: packet.project_id,
    build_packet_id: packet.id,
    packet_title: packet.title,
    packet_goal: p.packet_goal ?? "",
    target_builder: p.target_builder ?? "OpenClaw",
    handoff_prompt: p.handoff_prompt ?? "",
    included_scope: scope.included ?? [],
    excluded_scope: scope.excluded ?? [],
    do_not_touch: scope.do_not_touch ?? [],
    expected_files_or_surfaces: scope.expected_files_or_surfaces ?? [],
    acceptance_criteria: p.acceptance_criteria ?? [],
    qa_requirements: p.qa_requirements ?? [],
    evidence_required: p.evidence_required ?? [],
    rollback_notes: p.rollback_notes ?? [],
    safety_notes: p.risk_notes ?? [],
  };
}

// ------------------------- getOpenClawConnectionStatus -------------------------

export type OpenClawConnectionStatus = {
  configured: boolean;
  mode: "http" | "manual_tracking";
  message: string;
};

export const getOpenClawConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context }): Promise<OpenClawConnectionStatus> => {
    await assertStaff(context as unknown as StaffContext);
    const hasUrl = !!process.env.OPENCLAW_API_URL;
    const hasKey = !!process.env.OPENCLAW_API_KEY;
    if (hasUrl && hasKey) {
      return {
        configured: true,
        mode: "http",
        message: "OpenClaw HTTP endpoint configured; runs will be posted directly.",
      };
    }
    return {
      configured: true,
      mode: "manual_tracking",
      message:
        "No OpenClaw HTTP endpoint configured. Runs will be tracked manually — send the packet to OpenClaw out-of-band and refresh status here.",
    };
  });

// ------------------------- listOpenClawRuns -------------------------

export const listOpenClawRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid.optional() }).parse(raw),
  )
  .handler(
    async ({ context, data }): Promise<{ runs: OpenClawRunRow[]; artifacts: OpenClawArtifactRow[] }> => {
      await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      let q = sb
        .from("engine_project_openclaw_runs")
        .select("*")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false });
      if (data.packetId) q = q.eq("build_packet_id", data.packetId);
      const { data: runs, error } = await q;
      if (error) throw new Error(error.message ?? "Failed to list runs");
      const runIds = (runs ?? []).map((r: OpenClawRunRow) => r.id);
      let artifacts: OpenClawArtifactRow[] = [];
      if (runIds.length > 0) {
        const { data: art, error: aerr } = await sb
          .from("engine_project_openclaw_artifacts")
          .select("*")
          .in("openclaw_run_id", runIds)
          .order("created_at", { ascending: false });
        if (aerr) throw new Error(aerr.message ?? "Failed to list artifacts");
        artifacts = (art ?? []) as OpenClawArtifactRow[];
      }
      return { runs: (runs ?? []) as OpenClawRunRow[], artifacts };
    },
  );

// ------------------------- prepareOpenClawRun -------------------------

export type PreparedOpenClawRun = {
  eligible: boolean;
  reason: string | null;
  packet: BuildPacketRow;
  request_payload: OpenClawRequestPayload;
  do_not_send: string[];
};

const DO_NOT_SEND = [
  "provider API keys or auth tokens",
  "hidden system prompts",
  "raw secrets or environment variables",
  "unrelated projects",
  "client portal private fields",
  "unrelated internal notes",
  "full database dumps",
];

export const prepareOpenClawRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, packetId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<PreparedOpenClawRun> => {
    await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.packetId);
    if (packet.project_id !== data.projectId) throw new Error("Project scope mismatch");
    const targetBuilder = (packet.payload as Partial<BuildPacketPayload>)?.target_builder ?? "";
    const builderOk = targetBuilder === "OpenClaw" || packet.packet_type === "mixed" || packet.packet_type === "openclaw";
    const statusOk = packet.status === "ready" || packet.status === "handed_off";
    const eligible = builderOk && statusOk;
    const reason = !builderOk
      ? "Packet target builder is not OpenClaw."
      : !statusOk
      ? `Packet status ${packet.status} is not eligible (need ready or handed_off).`
      : null;
    return {
      eligible,
      reason,
      packet,
      request_payload: buildRequestPayload(packet),
      do_not_send: DO_NOT_SEND,
    };
  });

// ------------------------- startOpenClawRun -------------------------

export const startOpenClawRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        packetId: uuid,
        confirm: z.literal(true),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ run: OpenClawRunRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const packet = await loadPacket(sb, data.packetId);
    if (packet.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (!(packet.status === "ready" || packet.status === "handed_off")) {
      throw new Error(
        `Packet status ${packet.status} is not eligible for OpenClaw (need ready or handed_off).`,
      );
    }
    const targetBuilder = (packet.payload as Partial<BuildPacketPayload>)?.target_builder ?? "";
    if (!(targetBuilder === "OpenClaw" || packet.packet_type === "mixed" || packet.packet_type === "openclaw")) {
      throw new Error("Packet target builder is not OpenClaw.");
    }

    const req = buildRequestPayload(packet);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // insert run row (queued)
    const { data: runIns, error: runErr } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .insert({
        project_id: data.projectId,
        build_packet_id: data.packetId,
        implementation_plan_id: packet.implementation_plan_id,
        status: "queued",
        provider: "openclaw",
        run_mode: "manual",
        request_payload: req as unknown as Json,
        started_by: staff.userId,
        started_by_email: staff.email,
      })
      .select("*")
      .single();
    if (runErr) throw new Error(runErr.message ?? "Failed to create OpenClaw run");
    let run = runIns as OpenClawRunRow;

    await insertAudit(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "openclaw_run_prepared",
    });

    // Attempt live HTTP handoff if configured, otherwise stay in manual mode.
    const url = process.env.OPENCLAW_API_URL;
    const key = process.env.OPENCLAW_API_KEY;
    let nextStatus: OpenClawRunStatus = "sent";
    let responsePayload: Json = { mode: "manual_tracking" } as unknown as Json;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (url && key) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const bodyText = await resp.text();
        let bodyJson: unknown = null;
        try {
          bodyJson = JSON.parse(bodyText);
        } catch {
          bodyJson = { raw: bodyText.slice(0, 4000) };
        }
        if (!resp.ok) {
          nextStatus = "failed";
          errorCode = `http_${resp.status}`;
          errorMessage = `OpenClaw returned HTTP ${resp.status}`;
        } else {
          nextStatus = "running";
        }
        responsePayload = { status: resp.status, body: bodyJson } as unknown as Json;
      } catch (err) {
        nextStatus = "failed";
        errorCode = err instanceof DOMException && err.name === "AbortError" ? "timeout" : "network_error";
        errorMessage = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
      }
    }

    const { data: upd, error: updErr } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .update({
        status: nextStatus,
        response_payload: responsePayload,
        error_code: errorCode,
        error_message: errorMessage,
      })
      .eq("id", run.id)
      .select("*")
      .single();
    if (!updErr && upd) run = upd as OpenClawRunRow;

    // Move packet to handed_off if it was ready
    if (packet.status === "ready" && nextStatus !== "failed") {
      await supabaseAdmin
        .from("engine_project_build_packets")
        .update({ status: "handed_off", handed_off_at: new Date().toISOString() })
        .eq("id", packet.id);
    }

    await insertAudit(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: nextStatus === "failed" ? "openclaw_run_failed" : "openclaw_run_started",
      success: nextStatus !== "failed",
      errorCode,
    });
    await insertActivity(
      sb,
      data.projectId,
      nextStatus === "failed" ? "openclaw_run_failed" : "openclaw_run_started",
      nextStatus === "failed" ? "OpenClaw run failed to start" : "OpenClaw run started",
      nextStatus === "failed"
        ? `${staff.email} attempted to send packet "${packet.title.slice(0, 80)}" to OpenClaw but the run failed (${errorCode ?? "unknown"}).`
        : `${staff.email} sent packet "${packet.title.slice(0, 80)}" to OpenClaw (${nextStatus}).`,
      nextStatus === "failed" ? "error" : "info",
    );

    if (nextStatus === "failed") {
      try {
        await supabaseAdmin.from("operator_notifications").insert({
          kind: "openclaw_run_failed",
          title: `OpenClaw run failed for "${packet.title.slice(0, 80)}"`,
          body: errorMessage ?? "OpenClaw run failed to start.",
          href: `/engine/projects/${data.projectId}/build-execution`,
          metadata: { engine_project_id: data.projectId, packet_id: packet.id, run_id: run.id, error_code: errorCode },
        });
      } catch {
        /* best-effort */
      }
    }

    return { run };
  });

// ------------------------- refreshOpenClawRun -------------------------

export const refreshOpenClawRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        runId: uuid,
        status: z
          .enum(["running", "completed", "failed", "timed_out"])
          .optional(),
        outputSummary: z.string().trim().max(4000).optional(),
        errorMessage: z.string().trim().max(1000).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ run: OpenClawRunRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const run = await loadRun(sb, data.runId);
    if (run.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (["completed", "failed", "cancelled", "timed_out", "returned_for_review"].includes(run.status) && !data.status) {
      return { run };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.outputSummary !== undefined) patch.output_summary = data.outputSummary;
    if (data.errorMessage !== undefined) patch.error_message = data.errorMessage;
    if (data.status === "completed" || data.status === "failed" || data.status === "timed_out") {
      patch.completed_at = new Date().toISOString();
    }

    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", run.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to refresh run");
    const updated = upd as OpenClawRunRow;

    await insertAudit(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType:
        data.status === "completed"
          ? "openclaw_run_completed"
          : data.status === "failed"
          ? "openclaw_run_failed"
          : data.status === "timed_out"
          ? "openclaw_run_timed_out"
          : "openclaw_run_status_refreshed",
      success: data.status !== "failed" && data.status !== "timed_out",
    });

    if (data.status === "failed" || data.status === "timed_out") {
      try {
        await supabaseAdmin.from("operator_notifications").insert({
          kind: data.status === "failed" ? "openclaw_run_failed" : "openclaw_run_timed_out",
          title: `OpenClaw run ${data.status.replace("_", " ")}`,
          body: data.errorMessage ?? `Run ${run.id} ${data.status}.`,
          href: `/engine/projects/${data.projectId}/build-execution`,
          metadata: { engine_project_id: data.projectId, run_id: run.id, packet_id: run.build_packet_id },
        });
      } catch {
        /* best-effort */
      }
      await insertActivity(
        sb,
        data.projectId,
        data.status === "failed" ? "openclaw_run_failed" : "openclaw_run_timed_out",
        `OpenClaw run ${data.status.replace("_", " ")}`,
        `${staff.email} recorded OpenClaw run ${data.status}${data.errorMessage ? ` — ${data.errorMessage.slice(0, 200)}` : ""}.`,
        "error",
      );
    }

    return { run: updated };
  });

// ------------------------- cancelOpenClawRun -------------------------

export const cancelOpenClawRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, runId: uuid, reason: z.string().trim().max(1000).optional() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ run: OpenClawRunRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const run = await loadRun(sb, data.runId);
    if (run.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (["completed", "failed", "cancelled", "timed_out", "returned_for_review"].includes(run.status)) {
      throw new Error(`Run already in terminal status ${run.status}.`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: data.reason ?? null,
      })
      .eq("id", run.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to cancel run");

    await insertAudit(sb, {
      projectId: data.projectId,
      userId: staff.userId,
      email: staff.email,
      eventType: "openclaw_run_cancelled",
    });
    await insertActivity(
      sb,
      data.projectId,
      "openclaw_run_cancelled",
      "OpenClaw run cancelled",
      `${staff.email} cancelled OpenClaw run${data.reason ? ` — ${data.reason.slice(0, 200)}` : ""}.`,
    );
    return { run: upd as OpenClawRunRow };
  });

// ------------------------- attachOpenClawRunArtifact -------------------------

export const attachOpenClawRunArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        runId: uuid,
        artifactType: z.enum([
          "log",
          "diff_summary",
          "screenshot",
          "file_reference",
          "url",
          "note",
          "qa_report",
        ]),
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(4000).optional(),
        payload: z.record(z.string(), z.any()).default({}),
        addAsEvidence: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(
    async ({ context, data }): Promise<{ artifact: OpenClawArtifactRow; evidenceId: string | null }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const run = await loadRun(sb, data.runId);
      if (run.project_id !== data.projectId) throw new Error("Project scope mismatch");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: art, error } = await supabaseAdmin
        .from("engine_project_openclaw_artifacts")
        .insert({
          project_id: data.projectId,
          openclaw_run_id: run.id,
          build_packet_id: run.build_packet_id,
          artifact_type: data.artifactType,
          title: data.title,
          summary: data.summary ?? null,
          payload: data.payload,
          created_by: staff.userId,
          created_by_email: staff.email,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to attach artifact");

      let evidenceId: string | null = null;
      if (data.addAsEvidence) {
        const evType =
          data.artifactType === "screenshot"
            ? "screenshot"
            : data.artifactType === "log"
            ? "log"
            : data.artifactType === "diff_summary"
            ? "diff_summary"
            : data.artifactType === "qa_report"
            ? "qa_report"
            : data.artifactType === "url" || data.artifactType === "file_reference"
            ? "link"
            : "note";
        const { data: ev, error: eerr } = await supabaseAdmin
          .from("engine_project_build_evidence")
          .insert({
            project_id: data.projectId,
            build_packet_id: run.build_packet_id,
            evidence_type: evType,
            title: data.title,
            summary: data.summary ?? null,
            payload: { source: "openclaw", run_id: run.id, artifact_type: data.artifactType, ...data.payload },
            created_by_email: staff.email,
            created_by_user_id: staff.userId,
          })
          .select("id")
          .single();
        if (!eerr && ev) evidenceId = (ev as { id: string }).id;
      }

      await insertAudit(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: evidenceId ? "openclaw_output_added_to_evidence" : "openclaw_artifact_attached",
      });
      await insertActivity(
        sb,
        data.projectId,
        evidenceId ? "openclaw_output_added_to_evidence" : "openclaw_artifact_attached",
        evidenceId ? "OpenClaw output added as evidence" : "OpenClaw artifact attached",
        `${staff.email} attached ${data.artifactType} "${data.title.slice(0, 80)}" from OpenClaw run.`,
      );

      return { artifact: art as OpenClawArtifactRow, evidenceId };
    },
  );

// ------------------------- markOpenClawRunReturnedForReview -------------------------

export const markOpenClawRunReturnedForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        runId: uuid,
        movePacketTo: z.enum(["returned", "qa_required"]).default("qa_required"),
        note: z.string().trim().max(2000).optional(),
      })
      .parse(raw),
  )
  .handler(
    async ({ context, data }): Promise<{ run: OpenClawRunRow; packetStatus: string }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const run = await loadRun(sb, data.runId);
      if (run.project_id !== data.projectId) throw new Error("Project scope mismatch");
      const packet = await loadPacket(sb, run.build_packet_id);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: upd, error } = await supabaseAdmin
        .from("engine_project_openclaw_runs")
        .update({
          status: "returned_for_review",
          completed_at: run.completed_at ?? new Date().toISOString(),
        })
        .eq("id", run.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Failed to mark returned for review");

      // Move packet based on trigger-allowed transitions:
      // handed_off/in_progress -> returned/qa_required (per DB trigger).
      let newPacketStatus = packet.status;
      const canMove =
        (data.movePacketTo === "returned" && (packet.status === "handed_off" || packet.status === "in_progress")) ||
        (data.movePacketTo === "qa_required" && (packet.status === "in_progress" || packet.status === "returned"));
      if (canMove) {
        const { data: pkt } = await supabaseAdmin
          .from("engine_project_build_packets")
          .update({ status: data.movePacketTo })
          .eq("id", packet.id)
          .select("status")
          .single();
        if (pkt) newPacketStatus = (pkt as { status: string }).status;
      } else if (packet.status === "handed_off" && data.movePacketTo === "qa_required") {
        // two-step transition: handed_off -> in_progress -> qa_required
        await supabaseAdmin
          .from("engine_project_build_packets")
          .update({ status: "in_progress" })
          .eq("id", packet.id);
        const { data: pkt } = await supabaseAdmin
          .from("engine_project_build_packets")
          .update({ status: "qa_required" })
          .eq("id", packet.id)
          .select("status")
          .single();
        if (pkt) newPacketStatus = (pkt as { status: string }).status;
      }

      if (data.note) {
        await supabaseAdmin.from("engine_project_build_evidence").insert({
          project_id: data.projectId,
          build_packet_id: packet.id,
          evidence_type: "note",
          title: "OpenClaw return note",
          summary: data.note.slice(0, 2000),
          payload: { source: "openclaw_return", run_id: run.id },
          created_by_email: staff.email,
          created_by_user_id: staff.userId,
        });
      }

      await insertAudit(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "openclaw_run_returned_for_review",
      });
      await insertActivity(
        sb,
        data.projectId,
        "openclaw_run_returned_for_review",
        "OpenClaw run returned for review",
        `${staff.email} marked OpenClaw run returned for review; packet "${packet.title.slice(0, 80)}" now ${newPacketStatus}.`,
      );

      return { run: upd as OpenClawRunRow, packetStatus: newPacketStatus };
    },
  );
