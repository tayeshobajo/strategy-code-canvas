// OpenClaw v4 — Background Monitoring server functions.
//
// Monitoring only. Never starts new queues. Never runs the next queue item
// unless a human explicitly enables allow_auto_run_next (defaults false; even
// then this module refuses — advancing the queue requires the queue UI).
// Never accepts packets, marks QA passed, delivers the project, publishes
// portal content, applies migrations, or deploys code.
//
// Auto-refresh (allowed by default) means:
//   - Refresh known OpenClaw run rows by inspecting their timestamps.
//   - Mark a run timed_out when the timeout threshold is exceeded.
//   - Mirror that state into the linked queue item (via existing v2 mirror).
//   - Write monitor events + operator notifications.
//   - Update queue health summaries.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { Json } from "@/lib/engine-workspace";
import type { OpenClawRunRow } from "@/lib/engine-openclaw.functions";
import type {
  OpenClawQueueRow,
  OpenClawQueueItemRow,
} from "@/lib/engine-openclaw-queue.functions";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type StaffContext = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

export type MonitorSeverity = "info" | "warning" | "critical";

export type OpenClawMonitorSettings = {
  id: string;
  project_id: string;
  enabled: boolean;
  stale_run_minutes: number;
  timeout_minutes: number;
  notify_on_failure: boolean;
  notify_on_timeout: boolean;
  notify_on_stale: boolean;
  allow_auto_refresh: boolean;
  allow_auto_run_next: boolean;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OpenClawMonitorEvent = {
  id: string;
  project_id: string;
  queue_id: string | null;
  queue_item_id: string | null;
  openclaw_run_id: string | null;
  build_packet_id: string | null;
  event_type: string;
  severity: MonitorSeverity;
  status_before: string | null;
  status_after: string | null;
  summary: string;
  payload: Json;
  acknowledged_at: string | null;
  acknowledged_by_email: string | null;
  created_at: string;
};

export type MonitorFinding = {
  event_type: string;
  severity: MonitorSeverity;
  summary: string;
  openclaw_run_id?: string | null;
  queue_id?: string | null;
  queue_item_id?: string | null;
  build_packet_id?: string | null;
  status_before?: string | null;
  status_after?: string | null;
  payload?: Json;
  notify?: boolean;
  notify_kind?: string;
};

export type MonitorTickResult = {
  project_id: string;
  ran_at: string;
  findings_created: number;
  runs_marked_timed_out: number;
  events: OpenClawMonitorEvent[];
  skipped_reason?: string | null;
};

export type MonitorSnapshot = {
  settings: OpenClawMonitorSettings;
  latest_tick_at: string | null;
  events_unacknowledged: OpenClawMonitorEvent[];
  events_recent: OpenClawMonitorEvent[];
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
};

// ------------------------- helpers -------------------------

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
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  const isAdmin = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!isAdmin) throw new Error("Forbidden: admin role required");
  return { email, userId: ctx.userId ?? null };
}

async function assertProjectExists(sb: Sb, projectId: string) {
  const { data, error } = await sb
    .from("engine_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load project");
  if (!data) throw new Error("Project not found");
}

async function loadOrInitSettings(
  admin: Sb,
  projectId: string,
): Promise<OpenClawMonitorSettings> {
  const { data: existing } = await admin
    .from("engine_project_openclaw_monitor_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (existing) return existing as OpenClawMonitorSettings;

  const { data: created, error } = await admin
    .from("engine_project_openclaw_monitor_settings")
    .insert({ project_id: projectId })
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to initialise monitor settings");
  return created as OpenClawMonitorSettings;
}

async function insertActivity(
  admin: Sb,
  projectId: string,
  kind: string,
  title: string,
  body: string,
  severity: "info" | "warn" | "error" = "info",
) {
  try {
    await admin.from("engine_activity").insert({
      project_id: projectId, kind, title, body, severity,
    });
  } catch {
    /* best-effort */
  }
}

async function insertAuditLog(
  admin: Sb,
  args: {
    projectId: string;
    actorEmail: string;
    action: string;
    summary: string;
    queueId?: string | null;
    queueItemId?: string | null;
    buildPacketId?: string | null;
    openclawRunId?: string | null;
    success?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    extraMetadata?: Record<string, unknown>;
  },
) {
  try {
    const metadata: Record<string, unknown> = {
      queue_id: args.queueId ?? null,
      queue_item_id: args.queueItemId ?? null,
      build_packet_id: args.buildPacketId ?? null,
      openclaw_run_id: args.openclawRunId ?? null,
      user_email: args.actorEmail,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
      error_message: args.errorMessage ? String(args.errorMessage).slice(0, 500) : null,
      ...(args.extraMetadata ?? {}),
    };
    await admin.from("engine_audit_log").insert({
      project_id: args.projectId,
      actor_email: args.actorEmail,
      action: args.action,
      summary: args.summary.slice(0, 500),
      target_id: args.queueItemId ?? args.queueId ?? args.openclawRunId ?? null,
      affected_modules: ["build_execution", "openclaw_monitor"],
      metadata,
    });
  } catch {
    /* audit is best-effort */
  }
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

// Dedupe: skip inserting a finding if an unacknowledged event with the same
// (event_type, openclaw_run_id, queue_id, queue_item_id, build_packet_id)
// already exists in the last 24 hours.
async function findingIsDuplicate(
  admin: Sb,
  projectId: string,
  f: MonitorFinding,
): Promise<boolean> {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = admin
    .from("engine_project_openclaw_monitor_events")
    .select("id")
    .eq("project_id", projectId)
    .eq("event_type", f.event_type)
    .is("acknowledged_at", null)
    .gte("created_at", dayAgo)
    .limit(1);
  if (f.openclaw_run_id) q = q.eq("openclaw_run_id", f.openclaw_run_id);
  else q = q.is("openclaw_run_id", null);
  if (f.queue_item_id) q = q.eq("queue_item_id", f.queue_item_id);
  if (f.queue_id) q = q.eq("queue_id", f.queue_id);
  if (f.build_packet_id) q = q.eq("build_packet_id", f.build_packet_id);
  const { data } = await q;
  return Array.isArray(data) && data.length > 0;
}

// ------------------------- inspection helpers -------------------------

async function inspectRunsInternal(
  admin: Sb,
  projectId: string,
  settings: OpenClawMonitorSettings,
): Promise<{ findings: MonitorFinding[]; runsToTimeOut: OpenClawRunRow[] }> {
  const findings: MonitorFinding[] = [];
  const runsToTimeOut: OpenClawRunRow[] = [];

  const { data: runsRaw } = await admin
    .from("engine_project_openclaw_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  const runs = (runsRaw ?? []) as OpenClawRunRow[];
  const now = new Date();

  for (const run of runs) {
    const started = new Date(run.started_at ?? run.created_at);
    const ageMins = minutesBetween(now, started);

    // failed
    if (run.status === "failed") {
      findings.push({
        event_type: "openclaw_run_failed_detected",
        severity: "critical",
        openclaw_run_id: run.id,
        build_packet_id: run.build_packet_id,
        status_before: run.status,
        status_after: run.status,
        summary: `OpenClaw run ${run.id.slice(0, 8)} failed: ${(run.error_message ?? "no error message").slice(0, 240)}`,
        payload: { started_at: run.started_at, error_code: run.error_code },
        notify: settings.notify_on_failure,
        notify_kind: "openclaw_monitor_run_failed",
      });
      continue;
    }

    // active runs — check thresholds
    const active = run.status === "sent" || run.status === "running" || run.status === "queued";
    if (active) {
      if (ageMins >= settings.timeout_minutes) {
        // Mark as timed_out if auto-refresh is allowed
        if (settings.allow_auto_refresh) {
          runsToTimeOut.push(run);
        }
        findings.push({
          event_type: "openclaw_run_timed_out",
          severity: "critical",
          openclaw_run_id: run.id,
          build_packet_id: run.build_packet_id,
          status_before: run.status,
          status_after: settings.allow_auto_refresh ? "timed_out" : run.status,
          summary: `OpenClaw run ${run.id.slice(0, 8)} exceeded timeout (${Math.round(ageMins)}m ≥ ${settings.timeout_minutes}m).`,
          payload: { age_minutes: Math.round(ageMins), threshold: settings.timeout_minutes },
          notify: settings.notify_on_timeout,
          notify_kind: "openclaw_monitor_run_timed_out",
        });
      } else if (ageMins >= settings.stale_run_minutes) {
        findings.push({
          event_type: "openclaw_run_stale_detected",
          severity: "warning",
          openclaw_run_id: run.id,
          build_packet_id: run.build_packet_id,
          status_before: run.status,
          summary: `OpenClaw run ${run.id.slice(0, 8)} is stale (${Math.round(ageMins)}m ≥ ${settings.stale_run_minutes}m, still ${run.status}).`,
          payload: { age_minutes: Math.round(ageMins), threshold: settings.stale_run_minutes },
          notify: settings.notify_on_stale,
          notify_kind: "openclaw_monitor_run_stale",
        });
      }
    }
  }

  // Completed runs — check for missing artifacts / evidence
  const completed = runs.filter((r) => r.status === "completed" || r.status === "returned_for_review");
  if (completed.length > 0) {
    const runIds = completed.map((r) => r.id);
    const { data: artsRaw } = await admin
      .from("engine_project_openclaw_artifacts")
      .select("openclaw_run_id")
      .in("openclaw_run_id", runIds);
    const arts = (artsRaw ?? []) as Array<{ openclaw_run_id: string }>;
    const withArtifacts = new Set(arts.map((a) => a.openclaw_run_id));

    const { data: evRaw } = await admin
      .from("engine_project_build_evidence")
      .select("build_packet_id")
      .eq("project_id", projectId)
      .in("build_packet_id", completed.map((r) => r.build_packet_id));
    const evPackets = new Set(((evRaw ?? []) as Array<{ build_packet_id: string }>).map((e) => e.build_packet_id));

    for (const r of completed) {
      if (!withArtifacts.has(r.id)) {
        findings.push({
          event_type: "openclaw_packet_missing_evidence",
          severity: "warning",
          openclaw_run_id: r.id,
          build_packet_id: r.build_packet_id,
          summary: `Completed OpenClaw run ${r.id.slice(0, 8)} has no artifacts attached.`,
          payload: { missing: "artifacts" },
        });
      } else if (!evPackets.has(r.build_packet_id)) {
        findings.push({
          event_type: "openclaw_packet_missing_evidence",
          severity: "warning",
          openclaw_run_id: r.id,
          build_packet_id: r.build_packet_id,
          summary: `Packet ${r.build_packet_id.slice(0, 8)} has completed run but no build evidence attached.`,
          payload: { missing: "build_evidence" },
        });
      }

      if (r.status === "completed") {
        findings.push({
          event_type: "openclaw_run_completed_not_returned",
          severity: "info",
          openclaw_run_id: r.id,
          build_packet_id: r.build_packet_id,
          summary: `Run ${r.id.slice(0, 8)} completed but not yet returned for review.`,
          payload: {},
        });
      }
    }
  }

  return { findings, runsToTimeOut };
}

async function inspectQueuesInternal(
  admin: Sb,
  projectId: string,
): Promise<{ findings: MonitorFinding[] }> {
  const findings: MonitorFinding[] = [];
  const { data: queuesRaw } = await admin
    .from("engine_project_openclaw_queues")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["ready", "running", "paused", "failed"]);
  const queues = (queuesRaw ?? []) as OpenClawQueueRow[];
  if (queues.length === 0) return { findings };

  const qIds = queues.map((q) => q.id);
  const { data: itemsRaw } = await admin
    .from("engine_project_openclaw_queue_items")
    .select("*")
    .in("queue_id", qIds);
  const items = (itemsRaw ?? []) as OpenClawQueueItemRow[];
  const byQueue = new Map<string, OpenClawQueueItemRow[]>();
  for (const it of items) {
    const arr = byQueue.get(it.queue_id) ?? [];
    arr.push(it);
    byQueue.set(it.queue_id, arr);
  }

  for (const q of queues) {
    const its = byQueue.get(q.id) ?? [];
    const running = its.filter((i) => i.status === "running");
    const failed = its.filter((i) => i.status === "failed");
    const blocked = its.filter((i) => i.status === "blocked");

    if (q.status === "running" && running.length === 0) {
      findings.push({
        event_type: "openclaw_queue_stale_detected",
        severity: "warning",
        queue_id: q.id,
        summary: `Queue "${q.name}" is running but has no running item.`,
        payload: { status: q.status },
      });
    }
    if (q.status === "failed") {
      findings.push({
        event_type: "openclaw_queue_failed_detected",
        severity: "critical",
        queue_id: q.id,
        summary: `Queue "${q.name}" is in failed state.`,
        payload: {},
        notify: true,
        notify_kind: "openclaw_monitor_queue_failed",
      });
    }
    for (const f of failed) {
      findings.push({
        event_type: "openclaw_queue_failed_detected",
        severity: "critical",
        queue_id: q.id,
        queue_item_id: f.id,
        build_packet_id: f.build_packet_id,
        openclaw_run_id: f.openclaw_run_id,
        summary: `Queue item #${f.sequence_number} in "${q.name}" failed: ${(f.error_message ?? "unknown").slice(0, 200)}`,
        payload: { error_code: f.error_code },
        notify: true,
        notify_kind: "openclaw_monitor_queue_item_failed",
      });
    }
    for (const b of blocked) {
      findings.push({
        event_type: "openclaw_queue_stale_detected",
        severity: "warning",
        queue_id: q.id,
        queue_item_id: b.id,
        build_packet_id: b.build_packet_id,
        summary: `Queue item #${b.sequence_number} in "${q.name}" is blocked and needs operator review.`,
        payload: {},
      });
    }
    if (q.status === "paused") {
      findings.push({
        event_type: "openclaw_queue_stale_detected",
        severity: "warning",
        queue_id: q.id,
        summary: `Queue "${q.name}" is paused (likely by stop-on-failure policy).`,
        payload: {},
      });
    }
  }

  return { findings };
}

async function inspectPacketsInternal(
  admin: Sb,
  projectId: string,
  settings: OpenClawMonitorSettings,
): Promise<{ findings: MonitorFinding[] }> {
  const findings: MonitorFinding[] = [];
  const { data: pktsRaw } = await admin
    .from("engine_project_build_packets")
    .select("id,title,status,updated_at,created_at")
    .eq("project_id", projectId)
    .in("status", ["handed_off", "in_progress", "returned", "qa_required"]);
  const pkts = (pktsRaw ?? []) as Array<{
    id: string; title: string; status: string; updated_at: string; created_at: string;
  }>;
  if (pkts.length === 0) return { findings };

  const pktIds = pkts.map((p) => p.id);
  const { data: evRaw } = await admin
    .from("engine_project_build_evidence")
    .select("build_packet_id")
    .eq("project_id", projectId)
    .in("build_packet_id", pktIds);
  const evSet = new Set(((evRaw ?? []) as Array<{ build_packet_id: string }>).map((e) => e.build_packet_id));

  const now = new Date();
  for (const p of pkts) {
    const ageMins = minutesBetween(now, new Date(p.updated_at ?? p.created_at));

    if ((p.status === "handed_off" || p.status === "in_progress") && ageMins >= settings.stale_run_minutes) {
      findings.push({
        event_type: "openclaw_packet_awaiting_qa",
        severity: ageMins >= settings.timeout_minutes ? "warning" : "info",
        build_packet_id: p.id,
        status_before: p.status,
        summary: `Packet "${p.title.slice(0, 80)}" is ${p.status} for ${Math.round(ageMins)}m.`,
        payload: { age_minutes: Math.round(ageMins) },
      });
    }
    if ((p.status === "returned" || p.status === "qa_required") && !evSet.has(p.id)) {
      findings.push({
        event_type: "openclaw_packet_missing_evidence",
        severity: "warning",
        build_packet_id: p.id,
        status_before: p.status,
        summary: `Packet "${p.title.slice(0, 80)}" is ${p.status} but has no evidence attached.`,
        payload: {},
      });
    }
    if (p.status === "qa_required") {
      findings.push({
        event_type: "openclaw_packet_awaiting_qa",
        severity: "info",
        build_packet_id: p.id,
        status_before: p.status,
        summary: `Packet "${p.title.slice(0, 80)}" is awaiting QA.`,
        payload: {},
      });
    }
  }
  return { findings };
}

// ------------------------- monitor tick -------------------------

async function persistFinding(
  admin: Sb,
  projectId: string,
  f: MonitorFinding,
): Promise<OpenClawMonitorEvent | null> {
  if (await findingIsDuplicate(admin, projectId, f)) return null;
  const { data, error } = await admin
    .from("engine_project_openclaw_monitor_events")
    .insert({
      project_id: projectId,
      queue_id: f.queue_id ?? null,
      queue_item_id: f.queue_item_id ?? null,
      openclaw_run_id: f.openclaw_run_id ?? null,
      build_packet_id: f.build_packet_id ?? null,
      event_type: f.event_type,
      severity: f.severity,
      status_before: f.status_before ?? null,
      status_after: f.status_after ?? null,
      summary: f.summary.slice(0, 2000),
      payload: (f.payload ?? {}) as Json,
    })
    .select("*")
    .single();
  if (error) return null;

  if (f.notify && (f.severity === "critical" || f.severity === "warning")) {
    try {
      await admin.from("operator_notifications").insert({
        kind: f.notify_kind ?? `openclaw_monitor_${f.event_type}`,
        title: `OpenClaw monitor: ${f.event_type.replace(/_/g, " ")}`,
        body: f.summary.slice(0, 500),
        href: `/engine/projects/${projectId}/build-execution`,
        metadata: {
          engine_project_id: projectId,
          openclaw_run_id: f.openclaw_run_id ?? null,
          queue_id: f.queue_id ?? null,
          queue_item_id: f.queue_item_id ?? null,
          build_packet_id: f.build_packet_id ?? null,
          severity: f.severity,
        },
      });
    } catch { /* best-effort */ }
  }

  if (f.severity === "critical") {
    await insertActivity(admin, projectId, "openclaw_monitor_critical", `Monitor: ${f.event_type}`, f.summary, "error");
  }
  return data as OpenClawMonitorEvent;
}

async function runTickForProject(
  admin: Sb,
  projectId: string,
  actorEmail: string,
): Promise<MonitorTickResult> {
  const settings = await loadOrInitSettings(admin, projectId);
  const startedAt = new Date().toISOString();

  if (!settings.enabled) {
    return {
      project_id: projectId,
      ran_at: startedAt,
      findings_created: 0,
      runs_marked_timed_out: 0,
      events: [],
      skipped_reason: "monitor disabled",
    };
  }

  await insertAuditLog(admin, {
    projectId,
    actorEmail,
    action: "openclaw_monitor_tick_started",
    summary: "OpenClaw monitor tick started.",
  });

  const runInsp = await inspectRunsInternal(admin, projectId, settings);
  const queueInsp = await inspectQueuesInternal(admin, projectId);
  const packetInsp = await inspectPacketsInternal(admin, projectId, settings);

  // Auto-refresh: mark timed-out runs.
  let runsMarked = 0;
  if (settings.allow_auto_refresh && runInsp.runsToTimeOut.length > 0) {
    for (const run of runInsp.runsToTimeOut) {
      const { error } = await admin
        .from("engine_project_openclaw_runs")
        .update({
          status: "timed_out",
          completed_at: new Date().toISOString(),
          error_code: run.error_code ?? "monitor_timeout",
          error_message: run.error_message ?? "Marked timed_out by background monitor.",
        })
        .eq("id", run.id)
        .in("status", ["queued", "sent", "running"]);
      if (!error) {
        runsMarked += 1;
        await insertActivity(admin, projectId, "openclaw_run_timed_out",
          "OpenClaw run marked timed_out",
          `Monitor marked run ${run.id} as timed_out after exceeding threshold.`, "warn");
        await insertAuditLog(admin, {
          projectId,
          actorEmail,
          action: "openclaw_run_timed_out",
          summary: `Monitor auto-timeout of run ${run.id}.`,
          openclawRunId: run.id,
          buildPacketId: run.build_packet_id,
        });
        // Mirror into linked queue item if any
        try {
          const { _mirrorRunToQueueItem } = await import("@/lib/engine-openclaw-queue.functions");
          await _mirrorRunToQueueItem(admin, {
            projectId,
            runId: run.id,
            outcome: "failed",
            errorMessage: "Monitor auto-timeout.",
          });
        } catch { /* best-effort */ }
      }
    }
  }

  const allFindings = [...runInsp.findings, ...queueInsp.findings, ...packetInsp.findings];
  const events: OpenClawMonitorEvent[] = [];
  for (const f of allFindings) {
    const ev = await persistFinding(admin, projectId, f);
    if (ev) events.push(ev);
  }

  // Update last_tick_at
  await admin
    .from("engine_project_openclaw_monitor_settings")
    .update({ last_tick_at: startedAt })
    .eq("project_id", projectId);

  await insertAuditLog(admin, {
    projectId,
    actorEmail,
    action: "openclaw_monitor_tick_completed",
    summary: `Tick complete: ${events.length} new events, ${runsMarked} runs auto-timed-out.`,
    extraMetadata: {
      findings_total: allFindings.length,
      findings_new: events.length,
      runs_marked_timed_out: runsMarked,
    },
  });

  return {
    project_id: projectId,
    ran_at: startedAt,
    findings_created: events.length,
    runs_marked_timed_out: runsMarked,
    events,
  };
}

// ------------------------- public server functions -------------------------

export const getOpenClawMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<MonitorSnapshot> => {
    await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await assertProjectExists(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadOrInitSettings(supabaseAdmin, data.projectId);

    const { data: unackRaw } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_events")
      .select("*")
      .eq("project_id", data.projectId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const unack = (unackRaw ?? []) as OpenClawMonitorEvent[];

    const { data: recentRaw } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_events")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    const recent = (recentRaw ?? []) as OpenClawMonitorEvent[];

    const counts = {
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
    };

    return {
      settings,
      latest_tick_at: settings.last_tick_at,
      events_unacknowledged: unack,
      events_recent: recent,
      counts,
    };
  });

export const getOpenClawMonitorSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ settings: OpenClawMonitorSettings }> => {
    await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await assertProjectExists(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadOrInitSettings(supabaseAdmin, data.projectId);
    return { settings };
  });

export const updateOpenClawMonitorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      projectId: uuid,
      enabled: z.boolean().optional(),
      stale_run_minutes: z.number().int().min(1).max(24 * 60).optional(),
      timeout_minutes: z.number().int().min(1).max(24 * 60).optional(),
      notify_on_failure: z.boolean().optional(),
      notify_on_timeout: z.boolean().optional(),
      notify_on_stale: z.boolean().optional(),
      allow_auto_refresh: z.boolean().optional(),
      allow_auto_run_next: z.boolean().optional(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ settings: OpenClawMonitorSettings }> => {
    const admin = await assertAdmin(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await assertProjectExists(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure a settings row exists first
    await loadOrInitSettings(supabaseAdmin, data.projectId);

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.stale_run_minutes !== undefined) patch.stale_run_minutes = data.stale_run_minutes;
    if (data.timeout_minutes !== undefined) patch.timeout_minutes = data.timeout_minutes;
    if (data.notify_on_failure !== undefined) patch.notify_on_failure = data.notify_on_failure;
    if (data.notify_on_timeout !== undefined) patch.notify_on_timeout = data.notify_on_timeout;
    if (data.notify_on_stale !== undefined) patch.notify_on_stale = data.notify_on_stale;
    if (data.allow_auto_refresh !== undefined) patch.allow_auto_refresh = data.allow_auto_refresh;
    if (data.allow_auto_run_next !== undefined) patch.allow_auto_run_next = data.allow_auto_run_next;

    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_settings")
      .update(patch)
      .eq("project_id", data.projectId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to update monitor settings");

    await insertActivity(supabaseAdmin, data.projectId, "openclaw_monitor_settings_updated",
      "OpenClaw monitor settings updated",
      `Admin ${admin.email} updated monitor settings: ${Object.keys(patch).join(", ")}.`, "info");
    await insertAuditLog(supabaseAdmin, {
      projectId: data.projectId,
      actorEmail: admin.email,
      action: "openclaw_monitor_settings_updated",
      summary: `Settings updated: ${Object.keys(patch).join(", ")}.`,
      extraMetadata: { changed_fields: Object.keys(patch) },
    });
    return { settings: upd as OpenClawMonitorSettings };
  });

export const runOpenClawMonitorTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<MonitorTickResult> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await assertProjectExists(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await runTickForProject(supabaseAdmin, data.projectId, staff.email);
  });

// Global tick — admin only (also usable by a scheduled service_role call
// through a public webhook if wired up separately).
export const runGlobalOpenClawMonitorTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({}).parse(raw ?? {}))
  .handler(async ({ context }): Promise<{ ticks: MonitorTickResult[] }> => {
    const admin = await assertAdmin(context as unknown as StaffContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sets } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_settings")
      .select("project_id, enabled")
      .eq("enabled", true);
    const projectIds = ((sets ?? []) as Array<{ project_id: string; enabled: boolean }>).map(
      (s) => s.project_id,
    );
    // Also include projects that have OpenClaw runs but no settings row yet.
    const { data: runProjects } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .select("project_id")
      .limit(500);
    for (const r of (runProjects ?? []) as Array<{ project_id: string }>) {
      if (!projectIds.includes(r.project_id)) projectIds.push(r.project_id);
    }
    const ticks: MonitorTickResult[] = [];
    for (const pid of projectIds) {
      try {
        ticks.push(await runTickForProject(supabaseAdmin, pid, admin.email));
      } catch { /* per-project failure should not stop the batch */ }
    }
    return { ticks };
  });

export const inspectStaleOpenClawRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ findings: MonitorFinding[] }> => {
    await assertStaff(context as unknown as StaffContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadOrInitSettings(supabaseAdmin, data.projectId);
    const { findings } = await inspectRunsInternal(supabaseAdmin, data.projectId, settings);
    return { findings };
  });

export const inspectOpenClawQueueHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ findings: MonitorFinding[] }> => {
    await assertStaff(context as unknown as StaffContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findings } = await inspectQueuesInternal(supabaseAdmin, data.projectId);
    return { findings };
  });

export const markOpenClawRunTimedOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, runId: uuid, reason: z.string().trim().max(500).optional() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    await assertProjectExists(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: run, error: rErr } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .select("id, project_id, status, build_packet_id, error_code, error_message")
      .eq("id", data.runId)
      .maybeSingle();
    if (rErr || !run) throw new Error("OpenClaw run not found");
    if (run.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (!["queued", "sent", "running"].includes(run.status)) {
      return { ok: false };
    }

    const { error } = await supabaseAdmin
      .from("engine_project_openclaw_runs")
      .update({
        status: "timed_out",
        completed_at: new Date().toISOString(),
        error_code: run.error_code ?? "manual_timeout",
        error_message: data.reason ?? run.error_message ?? "Manually marked timed_out.",
      })
      .eq("id", run.id);
    if (error) throw new Error(error.message ?? "Failed to mark timed_out");

    await insertActivity(supabaseAdmin, data.projectId, "openclaw_run_timed_out",
      "OpenClaw run marked timed_out",
      `Staff ${staff.email} marked run ${run.id} as timed_out.`, "warn");
    await insertAuditLog(supabaseAdmin, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "openclaw_run_timed_out",
      summary: `Manual timeout of run ${run.id}.`,
      openclawRunId: run.id,
      buildPacketId: run.build_packet_id,
    });
    try {
      const { _mirrorRunToQueueItem } = await import("@/lib/engine-openclaw-queue.functions");
      await _mirrorRunToQueueItem(supabaseAdmin, {
        projectId: data.projectId,
        runId: run.id,
        outcome: "failed",
        errorMessage: data.reason ?? "Manually marked timed_out.",
      });
    } catch { /* best-effort */ }
    return { ok: true };
  });

export const acknowledgeOpenClawMonitorEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, eventId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ event: OpenClawMonitorEvent }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: eErr } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_events")
      .select("*")
      .eq("id", data.eventId)
      .maybeSingle();
    if (eErr || !existing) throw new Error("Monitor event not found");
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");

    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_monitor_events")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by_email: staff.email,
      })
      .eq("id", data.eventId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to acknowledge event");

    await insertAuditLog(supabaseAdmin, {
      projectId: data.projectId,
      actorEmail: staff.email,
      action: "openclaw_monitor_event_acknowledged",
      summary: `Acknowledged monitor event ${data.eventId} (${existing.event_type}).`,
      extraMetadata: { event_type: existing.event_type, severity: existing.severity },
    });
    return { event: upd as OpenClawMonitorEvent };
  });
