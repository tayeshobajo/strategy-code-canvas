// OpenClaw v3 — Supervised Run Queue server functions.
//
// Staff-only. Supervised only — never full autonomy.
// - Operator/admin selects eligible packets and creates a queue (draft → ready).
// - Queue is started explicitly and runs one item at a time.
// - Each item reuses the v2 startOpenClawRun code path via HTTP or manual mode.
// - Failure policy decides whether to pause the queue or block the item for review.
// - Nothing is auto-accepted, delivered, published, deployed, or QA-passed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { startOpenClawRun } from "@/lib/engine-openclaw.functions";
import type { BuildPacketRow, BuildPacketPayload } from "@/lib/engine-build-execution.functions";
import type { Json } from "@/lib/engine-workspace";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type StaffContext = { claims?: Record<string, unknown>; userId?: string; supabase: Sb };

export type OpenClawQueueStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

export type OpenClawQueueItemStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"
  | "blocked";

export type OpenClawFailurePolicy = "stop_queue" | "continue_after_review";

export type OpenClawQueueRow = {
  id: string;
  project_id: string;
  name: string;
  status: OpenClawQueueStatus;
  run_mode: "supervised";
  failure_policy: OpenClawFailurePolicy;
  simulated: boolean;
  created_by: string | null;
  created_by_email: string | null;
  started_by: string | null;
  started_by_email: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type OpenClawQueueItemRow = {
  id: string;
  project_id: string;
  queue_id: string;
  build_packet_id: string;
  openclaw_run_id: string | null;
  sequence_number: number;
  status: OpenClawQueueItemStatus;
  failure_policy: OpenClawFailurePolicy;
  requires_confirmation: boolean;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibleQueuePacket = {
  id: string;
  title: string;
  status: string;
  packet_type: string;
  target_builder: string;
  priority: string | null;
  risk_notes: string[];
  dependencies: string[];
  in_active_queue: boolean;
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

// Persistent audit trail in engine_audit_log. Written via supabaseAdmin so it
// records regardless of the caller's role (operators do not have INSERT
// privilege by policy). Payload contains queue/item/packet/run identifiers,
// the actor, and pass/fail info — NEVER provider keys, tokens, hidden
// prompts, or raw secrets.
async function insertAuditLog(args: {
  projectId: string;
  actorEmail: string;
  userId: string | null;
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
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const metadata: Record<string, unknown> = {
      queue_id: args.queueId ?? null,
      queue_item_id: args.queueItemId ?? null,
      build_packet_id: args.buildPacketId ?? null,
      openclaw_run_id: args.openclawRunId ?? null,
      user_id: args.userId ?? null,
      user_email: args.actorEmail,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
      error_message: args.errorMessage ? String(args.errorMessage).slice(0, 500) : null,
      ...(args.extraMetadata ?? {}),
    };
    await supabaseAdmin.from("engine_audit_log").insert({
      project_id: args.projectId,
      actor_email: args.actorEmail,
      action: args.action,
      summary: args.summary.slice(0, 500),
      target_id: args.queueItemId ?? args.queueId ?? null,
      affected_modules: ["build_execution", "openclaw_queue"],
      metadata: metadata as unknown as import("@/integrations/supabase/types").Json,
    });
  } catch {
    /* audit is best-effort — never break the caller */
  }
}

async function loadQueue(sb: Sb, queueId: string): Promise<OpenClawQueueRow> {
  const { data, error } = await sb
    .from("engine_project_openclaw_queues")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load queue");
  if (!data) throw new Error("OpenClaw queue not found");
  return data as OpenClawQueueRow;
}

async function loadQueueItem(sb: Sb, itemId: string): Promise<OpenClawQueueItemRow> {
  const { data, error } = await sb
    .from("engine_project_openclaw_queue_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load queue item");
  if (!data) throw new Error("OpenClaw queue item not found");
  return data as OpenClawQueueItemRow;
}

function packetEligible(p: BuildPacketRow): boolean {
  const tb = (p.payload as Partial<BuildPacketPayload>)?.target_builder ?? "";
  const builderOk = tb === "OpenClaw" || p.packet_type === "openclaw" || p.packet_type === "mixed";
  const statusOk = p.status === "ready" || p.status === "handed_off";
  return builderOk && statusOk;
}

// ------------------------- listOpenClawQueues -------------------------

export const listOpenClawQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      queues: Array<
        OpenClawQueueRow & {
          item_counts: Record<OpenClawQueueItemStatus, number>;
          total_items: number;
          running_item: OpenClawQueueItemRow | null;
          next_item: OpenClawQueueItemRow | null;
        }
      >;
    }> => {
      await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const { data: qs, error } = await sb
        .from("engine_project_openclaw_queues")
        .select("*")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message ?? "Failed to list queues");
      const queues = (qs ?? []) as OpenClawQueueRow[];
      const ids = queues.map((q) => q.id);
      let items: OpenClawQueueItemRow[] = [];
      if (ids.length > 0) {
        const { data: its, error: iErr } = await sb
          .from("engine_project_openclaw_queue_items")
          .select("*")
          .in("queue_id", ids)
          .order("sequence_number", { ascending: true });
        if (iErr) throw new Error(iErr.message ?? "Failed to list queue items");
        items = (its ?? []) as OpenClawQueueItemRow[];
      }
      const enriched = queues.map((q) => {
        const qi = items.filter((i) => i.queue_id === q.id);
        const counts: Record<OpenClawQueueItemStatus, number> = {
          queued: 0, running: 0, completed: 0, failed: 0, skipped: 0, cancelled: 0, blocked: 0,
        };
        for (const it of qi) counts[it.status] = (counts[it.status] ?? 0) + 1;
        const running = qi.find((i) => i.status === "running") ?? null;
        const next = qi.find((i) => i.status === "queued") ?? null;
        return { ...q, item_counts: counts, total_items: qi.length, running_item: running, next_item: next };
      });
      return { queues: enriched };
    },
  );

// ------------------------- getOpenClawQueue -------------------------

export const getOpenClawQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueId: uuid }).parse(raw))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      queue: OpenClawQueueRow;
      items: OpenClawQueueItemRow[];
      packets: Record<string, { id: string; title: string; status: string; target_builder: string }>;
    }> => {
      await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const q = await loadQueue(sb, data.queueId);
      if (q.project_id !== data.projectId) throw new Error("Project scope mismatch");
      const { data: items, error } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("*")
        .eq("queue_id", q.id)
        .order("sequence_number", { ascending: true });
      if (error) throw new Error(error.message ?? "Failed to list items");
      const its = (items ?? []) as OpenClawQueueItemRow[];
      const pids = Array.from(new Set(its.map((i) => i.build_packet_id)));
      const packetMap: Record<string, { id: string; title: string; status: string; target_builder: string }> = {};
      if (pids.length > 0) {
        const { data: pkts } = await sb
          .from("engine_project_build_packets")
          .select("id,title,status,payload")
          .in("id", pids);
        for (const p of (pkts ?? []) as BuildPacketRow[]) {
          packetMap[p.id] = {
            id: p.id,
            title: p.title,
            status: p.status,
            target_builder: (p.payload as Partial<BuildPacketPayload>)?.target_builder ?? "",
          };
        }
      }
      return { queue: q, items: its, packets: packetMap };
    },
  );

// ------------------------- listEligibleOpenClawPackets -------------------------

export const listEligibleOpenClawPackets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ packets: EligibleQueuePacket[] }> => {
    await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const { data: pkts, error } = await sb
      .from("engine_project_build_packets")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message ?? "Failed to list packets");
    const all = (pkts ?? []) as BuildPacketRow[];
    const candidates = all.filter(packetEligible);
    const candidateIds = candidates.map((p) => p.id);
    let activeIds = new Set<string>();
    if (candidateIds.length > 0) {
      const { data: items } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("build_packet_id,status")
        .in("build_packet_id", candidateIds)
        .in("status", ["queued", "running", "blocked"]);
      activeIds = new Set(
        ((items ?? []) as Array<{ build_packet_id: string }>).map((i) => i.build_packet_id),
      );
    }
    return {
      packets: candidates.map((p) => {
        const pay = (p.payload ?? {}) as Partial<BuildPacketPayload>;
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          packet_type: p.packet_type,
          target_builder: pay.target_builder ?? "",
          priority: p.priority ?? null,
          risk_notes: pay.risk_notes ?? [],
          dependencies: pay.dependencies ?? [],
          in_active_queue: activeIds.has(p.id),
        };
      }),
    };
  });

// ------------------------- createOpenClawQueue -------------------------

export const createOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        name: z.string().trim().min(1).max(200),
        packetIds: z.array(uuid).min(1).max(50),
        failurePolicy: z.enum(["stop_queue", "continue_after_review"]).default("stop_queue"),
        simulated: z.boolean().default(false),
        confirm: z.literal(true),
      })
      .parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ queue: OpenClawQueueRow; items: OpenClawQueueItemRow[] }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;

      // dedupe
      const uniqueIds: string[] = [];
      for (const id of data.packetIds) if (!uniqueIds.includes(id)) uniqueIds.push(id);

      const { data: pkts, error: pErr } = await sb
        .from("engine_project_build_packets")
        .select("*")
        .in("id", uniqueIds);
      if (pErr) throw new Error(pErr.message ?? "Failed to load packets");
      const packets = (pkts ?? []) as BuildPacketRow[];
      if (packets.length !== uniqueIds.length) {
        throw new Error("One or more packets not found.");
      }
      for (const p of packets) {
        if (p.project_id !== data.projectId) throw new Error(`Packet ${p.id} not in project`);
        if (!packetEligible(p)) {
          throw new Error(
            `Packet "${p.title}" is not eligible for OpenClaw (status ${p.status}).`,
          );
        }
      }
      // check no packet already in an active queue
      const { data: existing } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("build_packet_id")
        .in("build_packet_id", uniqueIds)
        .in("status", ["queued", "running", "blocked"]);
      if (existing && existing.length > 0) {
        throw new Error(
          `${existing.length} packet(s) already active in another queue. Cancel/skip them first.`,
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: qIns, error: qErr } = await supabaseAdmin
        .from("engine_project_openclaw_queues")
        .insert({
          project_id: data.projectId,
          name: data.name,
          status: "ready",
          run_mode: "supervised",
          failure_policy: data.failurePolicy,
          simulated: data.simulated,
          created_by: staff.userId,
          created_by_email: staff.email,
          metadata: { packet_count: uniqueIds.length },
        })
        .select("*")
        .single();
      if (qErr) throw new Error(qErr.message ?? "Failed to create queue");
      const queue = qIns as OpenClawQueueRow;

      const itemRows = uniqueIds.map((packetId, idx) => ({
        project_id: data.projectId,
        queue_id: queue.id,
        build_packet_id: packetId,
        sequence_number: idx + 1,
        status: "queued" as const,
        failure_policy: data.failurePolicy,
        requires_confirmation: true,
      }));
      const { data: itIns, error: itErr } = await supabaseAdmin
        .from("engine_project_openclaw_queue_items")
        .insert(itemRows)
        .select("*");
      if (itErr) {
        // best-effort cleanup
        await supabaseAdmin.from("engine_project_openclaw_queues").delete().eq("id", queue.id);
        throw new Error(itErr.message ?? "Failed to create queue items");
      }
      const items = (itIns ?? []) as OpenClawQueueItemRow[];

      await insertAudit(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "openclaw_queue_created",
      });
      await insertActivity(
        sb,
        data.projectId,
        "openclaw_queue_created",
        "OpenClaw queue created",
        `${staff.email} created queue "${data.name}" with ${items.length} packet(s).`,
      );
      return { queue, items };
    },
  );

// ------------------------- lifecycle transitions -------------------------

async function transitionQueue(
  ctx: StaffContext,
  args: {
    projectId: string;
    queueId: string;
    to: OpenClawQueueStatus;
    eventType: string;
    activityTitle: string;
    activityBody: string;
    severity?: "info" | "warn" | "error";
    setStarted?: boolean;
    setCompleted?: boolean;
    setFailed?: boolean;
  },
): Promise<OpenClawQueueRow> {
  const staff = await assertStaff(ctx);
  const sb = ctx.supabase;
  const q = await loadQueue(sb, args.queueId);
  if (q.project_id !== args.projectId) throw new Error("Project scope mismatch");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const patch: Record<string, unknown> = { status: args.to };
  if (args.setStarted) {
    patch.started_by = staff.userId;
    patch.started_by_email = staff.email;
    patch.started_at = new Date().toISOString();
  }
  if (args.setCompleted || args.setFailed) {
    patch.completed_at = new Date().toISOString();
  }
  const { data: upd, error } = await supabaseAdmin
    .from("engine_project_openclaw_queues")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", q.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? `Failed to transition queue to ${args.to}`);

  await insertAudit(sb, {
    projectId: args.projectId,
    userId: staff.userId,
    email: staff.email,
    eventType: args.eventType,
    success: args.severity !== "error",
  });
  await insertActivity(sb, args.projectId, args.eventType, args.activityTitle, args.activityBody, args.severity);

  if (args.severity === "error") {
    try {
      await supabaseAdmin.from("operator_notifications").insert({
        kind: args.eventType,
        title: args.activityTitle,
        body: args.activityBody,
        href: `/engine/projects/${args.projectId}/build-execution`,
        metadata: { engine_project_id: args.projectId, queue_id: q.id },
      });
    } catch {
      /* best-effort */
    }
  }

  return upd as OpenClawQueueRow;
}

export const startOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    const queue = await transitionQueue(context as unknown as StaffContext, {
      projectId: data.projectId,
      queueId: data.queueId,
      to: "running",
      eventType: "openclaw_queue_started",
      activityTitle: "OpenClaw queue started",
      activityBody: "Queue is now running. Use Run Next Item to advance.",
      setStarted: true,
    });
    return { queue };
  });

export const pauseOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    const queue = await transitionQueue(context as unknown as StaffContext, {
      projectId: data.projectId,
      queueId: data.queueId,
      to: "paused",
      eventType: "openclaw_queue_paused",
      activityTitle: "OpenClaw queue paused",
      activityBody: "Queue paused by operator; no new items will start until resumed.",
    });
    return { queue };
  });

export const resumeOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    const queue = await transitionQueue(context as unknown as StaffContext, {
      projectId: data.projectId,
      queueId: data.queueId,
      to: "running",
      eventType: "openclaw_queue_resumed",
      activityTitle: "OpenClaw queue resumed",
      activityBody: "Queue resumed by operator.",
    });
    return { queue };
  });

export const cancelOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, queueId: uuid, reason: z.string().trim().max(500).optional() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const queue = await transitionQueue(context as unknown as StaffContext, {
      projectId: data.projectId,
      queueId: data.queueId,
      to: "cancelled",
      eventType: "openclaw_queue_cancelled",
      activityTitle: "OpenClaw queue cancelled",
      activityBody: `Queue cancelled${data.reason ? ` — ${data.reason.slice(0, 200)}` : ""}.`,
      setCompleted: true,
    });
    // Cancel any still-queued items
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("queue_id", queue.id)
      .in("status", ["queued", "blocked"]);
    return { queue };
  });

export const archiveOpenClawQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    const queue = await transitionQueue(context as unknown as StaffContext, {
      projectId: data.projectId,
      queueId: data.queueId,
      to: "archived",
      eventType: "openclaw_queue_archived",
      activityTitle: "OpenClaw queue archived",
      activityBody: "Queue archived; no further changes allowed.",
    });
    return { queue };
  });

// ------------------------- runNextQueueItem -------------------------

export const runNextQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, queueId: uuid, confirm: z.literal(true) }).parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ item: OpenClawQueueItemRow; runId: string | null; queueStatus: OpenClawQueueStatus }> => {
      const staff = await assertStaff(context as unknown as StaffContext);
      const sb = (context as unknown as StaffContext).supabase;
      const q = await loadQueue(sb, data.queueId);
      if (q.project_id !== data.projectId) throw new Error("Project scope mismatch");
      if (q.status !== "running") {
        throw new Error(`Queue must be running (currently ${q.status}). Start or resume it first.`);
      }

      // no concurrent running item
      const { data: running } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("id")
        .eq("queue_id", q.id)
        .eq("status", "running")
        .limit(1);
      if (running && running.length > 0) {
        throw new Error("Another queue item is already running. Wait for it to complete.");
      }

      // pick next queued item
      const { data: nextRows, error: nErr } = await sb
        .from("engine_project_openclaw_queue_items")
        .select("*")
        .eq("queue_id", q.id)
        .eq("status", "queued")
        .order("sequence_number", { ascending: true })
        .limit(1);
      if (nErr) throw new Error(nErr.message ?? "Failed to pick next item");
      const next = ((nextRows ?? []) as OpenClawQueueItemRow[])[0];
      if (!next) throw new Error("No queued items remaining.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // mark item running (without run yet)
      const { data: markRun, error: mErr } = await supabaseAdmin
        .from("engine_project_openclaw_queue_items")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", next.id)
        .select("*")
        .single();
      if (mErr) throw new Error(mErr.message ?? "Failed to mark item running");
      let item = markRun as OpenClawQueueItemRow;

      await insertAudit(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        eventType: "openclaw_queue_item_started",
      });

      // Call the existing v2 startOpenClawRun via its handler (server-to-server).
      // If it fails, mark the item failed and apply failure policy.
      let runId: string | null = null;
      let itemFailedError: string | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = (await (startOpenClawRun as unknown as any)({
          data: { projectId: data.projectId, packetId: item.build_packet_id, confirm: true },
        })) as { run: { id: string; status: string; error_message: string | null } };
        runId = res.run.id;
        // Link the run id back to the item
        const { data: linked } = await supabaseAdmin
          .from("engine_project_openclaw_queue_items")
          .update({ openclaw_run_id: runId })
          .eq("id", item.id)
          .select("*")
          .single();
        if (linked) item = linked as OpenClawQueueItemRow;

        if (res.run.status === "failed") {
          itemFailedError = res.run.error_message ?? "OpenClaw run failed to start.";
        }
      } catch (err) {
        itemFailedError = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
      }

      let queueStatus: OpenClawQueueStatus = q.status;
      if (itemFailedError) {
        const { data: failed } = await supabaseAdmin
          .from("engine_project_openclaw_queue_items")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_code: "start_failed",
            error_message: itemFailedError,
          })
          .eq("id", item.id)
          .select("*")
          .single();
        if (failed) item = failed as OpenClawQueueItemRow;

        await insertAudit(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          eventType: "openclaw_queue_item_failed",
          success: false,
          errorCode: "start_failed",
        });
        await insertActivity(
          sb,
          data.projectId,
          "openclaw_queue_item_failed",
          "OpenClaw queue item failed to start",
          `Item #${item.sequence_number} failed: ${itemFailedError.slice(0, 200)}`,
          "error",
        );
        try {
          await supabaseAdmin.from("operator_notifications").insert({
            kind: "openclaw_queue_item_failed",
            title: "OpenClaw queue item failed",
            body: `Item #${item.sequence_number} failed to start: ${itemFailedError.slice(0, 200)}`,
            href: `/engine/projects/${data.projectId}/build-execution`,
            metadata: {
              engine_project_id: data.projectId,
              queue_id: q.id,
              queue_item_id: item.id,
              build_packet_id: item.build_packet_id,
            },
          });
        } catch {
          /* best-effort */
        }

        // Apply queue failure policy
        if (item.failure_policy === "stop_queue") {
          const { data: pq } = await supabaseAdmin
            .from("engine_project_openclaw_queues")
            .update({ status: "paused" })
            .eq("id", q.id)
            .select("status")
            .single();
          if (pq) queueStatus = (pq as { status: OpenClawQueueStatus }).status;
        }
      }

      return { item, runId, queueStatus };
    },
  );

// ------------------------- retryQueueItem -------------------------

export const retryQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueItemId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ item: OpenClawQueueItemRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const item = await loadQueueItem(sb, data.queueItemId);
    if (item.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (item.status !== "failed") {
      throw new Error(`Item must be failed to retry (currently ${item.status}).`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .update({
        status: "queued",
        error_code: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        openclaw_run_id: null,
      })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to retry item");
    await insertAudit(sb, {
      projectId: data.projectId, userId: staff.userId, email: staff.email,
      eventType: "openclaw_queue_item_retried",
    });
    await insertActivity(
      sb, data.projectId, "openclaw_queue_item_retried",
      "OpenClaw queue item retried",
      `Item #${item.sequence_number} requeued by ${staff.email}.`,
    );
    return { item: upd as OpenClawQueueItemRow };
  });

// ------------------------- skipQueueItem -------------------------

export const skipQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        queueItemId: uuid,
        reason: z.string().trim().min(3).max(500),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ item: OpenClawQueueItemRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const item = await loadQueueItem(sb, data.queueItemId);
    if (item.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (!["queued", "blocked", "failed"].includes(item.status)) {
      throw new Error(`Item cannot be skipped from ${item.status}.`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        error_message: data.reason,
      })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to skip item");
    await insertAudit(sb, {
      projectId: data.projectId, userId: staff.userId, email: staff.email,
      eventType: "openclaw_queue_item_skipped",
    });
    await insertActivity(
      sb, data.projectId, "openclaw_queue_item_skipped",
      "OpenClaw queue item skipped",
      `Item #${item.sequence_number} skipped by ${staff.email} — ${data.reason.slice(0, 200)}`,
    );
    return { item: upd as OpenClawQueueItemRow };
  });

// ------------------------- markQueueItemReviewed -------------------------

export const markQueueItemReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid, queueItemId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ item: OpenClawQueueItemRow }> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    const sb = (context as unknown as StaffContext).supabase;
    const item = await loadQueueItem(sb, data.queueItemId);
    if (item.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (item.status !== "blocked") {
      throw new Error(`Item must be blocked to mark reviewed (currently ${item.status}).`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .update({ status: "queued", error_code: null, error_message: null })
      .eq("id", item.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to mark reviewed");
    await insertAudit(sb, {
      projectId: data.projectId, userId: staff.userId, email: staff.email,
      eventType: "openclaw_queue_item_reviewed",
    });
    return { item: upd as OpenClawQueueItemRow };
  });

// ------------------------- internal: mirror a run outcome into any linked queue item -------------------------
// Called from v2 refresh/cancel/returned-for-review hooks. Never accepts packets,
// never publishes, never touches project status.
export async function _mirrorRunToQueueItem(
  supabaseAdmin: Sb,
  args: { projectId: string; runId: string; outcome: "completed" | "failed" | "cancelled" | "returned_for_review"; errorMessage?: string | null },
): Promise<void> {
  try {
    const { data: itemRows } = await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .select("*")
      .eq("openclaw_run_id", args.runId)
      .eq("project_id", args.projectId)
      .limit(1);
    const item = ((itemRows ?? []) as OpenClawQueueItemRow[])[0];
    if (!item) return; // run not part of a queue

    // Only mirror when item is still running
    if (item.status !== "running") return;

    // Map v2 outcomes to queue item statuses
    let itemStatus: OpenClawQueueItemStatus;
    let severity: "info" | "warn" | "error" = "info";
    if (args.outcome === "completed" || args.outcome === "returned_for_review") {
      itemStatus = "completed";
    } else if (args.outcome === "cancelled") {
      itemStatus = "cancelled";
    } else {
      itemStatus = "failed";
      severity = "error";
    }

    const patch: Record<string, unknown> = {
      status: itemStatus,
      completed_at: new Date().toISOString(),
    };
    if (itemStatus === "failed") {
      patch.error_code = "run_failed";
      patch.error_message = args.errorMessage ?? null;
    }
    await supabaseAdmin
      .from("engine_project_openclaw_queue_items")
      .update(patch)
      .eq("id", item.id);

    // If failed & stop_queue policy, pause the queue.
    if (itemStatus === "failed" && item.failure_policy === "stop_queue") {
      await supabaseAdmin
        .from("engine_project_openclaw_queues")
        .update({ status: "paused" })
        .eq("id", item.queue_id)
        .eq("status", "running");
    } else if (itemStatus === "failed" && item.failure_policy === "continue_after_review") {
      // Move the failed item to blocked so operator must acknowledge before continuing.
      await supabaseAdmin
        .from("engine_project_openclaw_queue_items")
        .update({ status: "blocked" })
        .eq("id", item.id);
    }

    // Complete the queue automatically once every item is terminal & at least one completed.
    if (itemStatus === "completed" || itemStatus === "cancelled") {
      const { data: remaining } = await supabaseAdmin
        .from("engine_project_openclaw_queue_items")
        .select("status")
        .eq("queue_id", item.queue_id);
      const rows = ((remaining ?? []) as Array<{ status: OpenClawQueueItemStatus }>);
      const anyActive = rows.some((r) => ["queued", "running", "blocked"].includes(r.status));
      const anyCompleted = rows.some((r) => r.status === "completed");
      if (!anyActive && anyCompleted) {
        await supabaseAdmin
          .from("engine_project_openclaw_queues")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", item.queue_id)
          .in("status", ["running", "paused"]);
      }
    }

    try {
      await supabaseAdmin.from("engine_activity").insert({
        project_id: args.projectId,
        kind: `openclaw_queue_item_${itemStatus}`,
        title: `OpenClaw queue item ${itemStatus}`,
        body: `Item #${item.sequence_number} moved to ${itemStatus} via run outcome ${args.outcome}.`,
        severity,
      });
    } catch {
      /* best-effort */
    }
  } catch {
    /* mirroring is best-effort */
  }
}
