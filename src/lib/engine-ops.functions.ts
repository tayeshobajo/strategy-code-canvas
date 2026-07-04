import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { buildClientSafePayload } from "@/lib/roadmap-publish";

async function assertAdminEmail(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const admin = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!admin) throw new Error("Forbidden: admin role required");
  return email ?? "unknown";
}

async function assertOps(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const admin = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (admin) return email ?? "unknown";
  const op = await hasRoleForEmail(
    context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  if (!op) throw new Error("Forbidden: admin or operator role required");
  return email ?? "unknown";
}

// ─── Delivery Room ──────────────────────────────────────────────
export type DeliveryStatus =
  | "ready" | "scheduled" | "sent" | "viewed" | "responded"
  | "follow_up" | "accepted" | "execution" | "archived";

export type DeliveryItem = {
  id: string;
  client: string;
  roadmap: string;
  version: string;
  status: DeliveryStatus;
  channel: string;
  recipient: string | null;
  recipient_role: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  last_action: string | null;
  updated_at: string;
  history: Array<{ id: string; from_status: string | null; to_status: string; note: string | null; at: string; actor: string | null }>;
};

export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliveryItem[]> => {
    await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> };
      };
    };
    const { data, error } = await sb
      .from("engine_delivery_items")
      .select("id,client,roadmap,version,status,channel,recipient,recipient_role,prepared_by,approved_by,last_action,updated_at,engine_delivery_history(id,from_status,to_status,note,at,actor)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const rows = (data ?? []) as Array<DeliveryItem & { engine_delivery_history: DeliveryItem["history"] }>;
    return rows.map((r) => ({
      ...r,
      history: (r.engine_delivery_history ?? []).slice().sort((a, b) => a.at.localeCompare(b.at)),
    }));
  });

export const transitionDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    id: z.string().uuid(),
    to: z.enum(["ready","scheduled","sent","viewed","responded","follow_up","accepted","execution","archived"]),
    note: z.string().max(500).optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { data: curr, error: readErr } = await sb.from("engine_delivery_items").select("status,project_id,client,roadmap").eq("id", data.id).single();
    if (readErr) throw new Error(String((readErr as { message?: string }).message ?? readErr));
    const cur = curr as { status: string; project_id: string | null; client: string; roadmap: string } | null;
    const from = cur?.status ?? null;

    // Gate: transitioning to "sent" or "execution" requires the linked project
    // to have an approved snapshot. Prevents shipping unapproved roadmaps.
    if ((data.to === "sent" || data.to === "execution") && cur?.project_id) {
      const { data: proj } = await sb
        .from("engine_projects")
        .select("approved_snapshot")
        .eq("id", cur.project_id)
        .single() as unknown as { data: { approved_snapshot: Record<string, unknown> | null } | null };
      if (!proj?.approved_snapshot || Object.keys(proj.approved_snapshot).length === 0) {
        throw new Error(`Cannot move to "${data.to}": project has no approved roadmap version yet.`);
      }
    }

    const now = new Date();
    const stamp = now.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const labels: Record<string, string> = {
      ready: "Ready to Send", scheduled: "Presentation Scheduled", sent: "Sent",
      viewed: "Viewed", responded: "Client Responded", follow_up: "Follow-up Needed",
      accepted: "Accepted", execution: "Moved to Execution", archived: "Archived",
    };
    const { error: upErr } = await sb.from("engine_delivery_items").update({
      status: data.to, last_action: `${labels[data.to]} · ${stamp}`,
    }).eq("id", data.id);
    if (upErr) throw new Error(String((upErr as { message?: string }).message ?? upErr));
    await sb.from("engine_delivery_history").insert({
      delivery_id: data.id, from_status: from, to_status: data.to, note: data.note ?? null, actor,
    });
    if (cur?.project_id) {
      await sb.from("engine_audit_log").insert({
        project_id: cur.project_id,
        actor_email: actor,
        action: "delivery_transition",
        summary: `Delivery for ${cur.client} · ${cur.roadmap}: ${from ?? "—"} → ${data.to}.`,
        affected_modules: ["delivery"],
        target_id: data.id,
        metadata: { from, to: data.to, note: data.note ?? null },
      });
    }
    return { ok: true };
  });

// ─── Review & Approvals ─────────────────────────────────────────
export type ReviewItem = {
  id: string;
  project: string;
  item_type: string;
  title: string;
  impact: "high" | "medium" | "low";
  source: string | null;
  requested_by: string | null;
  status: "pending" | "in_review" | "approved" | "sent_back" | "rejected";
  created_at: string;
};
export type ReviewAudit = {
  id: string; project: string; item_type: string; title: string;
  action: "approved" | "sent_back" | "rejected"; reason: string | null;
  routed_to: string | null; actor: string | null; at: string;
};

export const listReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: ReviewItem[]; audit: ReviewAudit[] }> => {
    await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } };
      };
    };
    const [it, au] = await Promise.all([
      sb.from("engine_review_items").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("engine_review_audit").select("*").order("at", { ascending: false }).limit(200),
    ]);
    if (it.error) throw new Error(String((it.error as { message?: string }).message ?? it.error));
    if (au.error) throw new Error(String((au.error as { message?: string }).message ?? au.error));
    return { items: (it.data ?? []) as ReviewItem[], audit: (au.data ?? []) as ReviewAudit[] };
  });

const SOURCE_ROUTE: Record<string, string> = {
  "Roadmap Update": "Roadmap builder",
  "Version Change": "Versions · compare view",
  "Milestone Brief": "Milestone workspace",
  "Client Preview": "Client-facing preview editor",
  "Investment Change": "Investment builder",
  "Delivery Approval": "Delivery prep",
  "Agent Permission": "Agent permissions",
};

export const decideReviewItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["approved", "sent_back", "rejected"]),
    reason: z.string().max(1000).optional(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertOps(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: item, error: rErr } = await sb.from("engine_review_items")
      .select("project,project_id,item_type,title").eq("id", data.id).single();
    if (rErr) throw new Error(String((rErr as { message?: string }).message ?? rErr));
    const it = item as { project: string; project_id: string | null; item_type: string; title: string };
    const nextStatus = data.action === "approved" ? "approved" : data.action === "rejected" ? "rejected" : "sent_back";
    const { error: uErr } = await sb.from("engine_review_items")
      .update({ status: nextStatus }).eq("id", data.id);
    if (uErr) throw new Error(String((uErr as { message?: string }).message ?? uErr));
    await sb.from("engine_review_audit").insert({
      review_item_id: data.id, project: it.project, item_type: it.item_type,
      title: it.title, action: data.action, reason: data.reason ?? null,
      routed_to: data.action === "approved" ? null : (SOURCE_ROUTE[it.item_type] ?? null),
      actor,
    });
    // Resolve project row for downstream writes.
    let projId = it.project_id ?? null;
    if (!projId) {
      const { data: proj } = await sb.from("engine_projects")
        .select("id").eq("name", it.project).single() as unknown as { data: { id: string } | null };
      projId = proj?.id ?? null;
    }

    // P0-4: When a "roadmap_version" (or "Roadmap Update") review item is
    // approved, also flip the matching engine_roadmap_versions row to approved
    // and lock the approved snapshot on the project. Previously these were
    // two disconnected flows — operators thought they'd approved the roadmap
    // but the version stayed in ai_generated / tai_edited.
    if (data.action === "approved"
        && (it.item_type === "roadmap_version" || it.item_type === "Roadmap Update")
        && projId) {
      // The intelligence pipeline stores the review title === version.label,
      // e.g. "v0.2 — AI draft from ...". Match on label first, then fall back
      // to the most recent pending version on the project.
      const { data: matches } = await sb
        .from("engine_roadmap_versions")
        .select("id, version, payload, created_by, status, label")
        .eq("project_id", projId)
        .in("status", ["ai_generated", "tai_edited", "draft"])
        .order("created_at", { ascending: false })
        .limit(20) as unknown as { data: Array<{
          id: string; version: string; payload: Record<string, unknown> | null;
          created_by: string | null; status: string; label: string | null;
        }> | null };
      const rows = matches ?? [];
      const target = rows.find((r) => (r.label ?? "").trim() === it.title.trim()) ?? rows[0] ?? null;
      if (target) {
        const createdBy = (target.created_by ?? "").toString().toLowerCase();
        // Self-approval guard mirrors approveVersion.
        if (createdBy && createdBy !== "ai" && createdBy === actor.toLowerCase()) {
          throw new Error("You cannot approve a version you authored yourself — a second reviewer must approve this review item.");
        }
        // Block on unresolved critical change events.
        const { data: openCritical } = await sb
          .from("engine_change_events")
          .select("id").eq("project_id", projId)
          .eq("severity", "critical").is("resolved_at", null);
        if ((openCritical ?? []).length) {
          throw new Error("Resolve open critical change events before approving this version.");
        }
        const nowIso = new Date().toISOString();
        const { error: vErr } = await sb.from("engine_roadmap_versions")
          .update({ status: "approved", approved_by: actor, approved_at: nowIso })
          .eq("id", target.id);
        if (vErr) throw new Error(String((vErr as { message?: string }).message ?? vErr));
        await sb.from("engine_projects").update({
          approved_version: target.version,
          roadmap_version: target.version,
          approved_snapshot: target.payload ?? {},
          approved_at: nowIso,
          approved_by_email: actor,
        }).eq("id", projId);
        await sb.from("engine_activity").insert({
          project_id: projId,
          kind: "version_approved",
          title: `Version ${target.version} approved`,
          body: `Approved by ${actor} via review queue`,
          severity: "success",
        });
        await sb.from("roadmap_approvals").insert({
          version_id: target.id,
          project_id: projId,
          snapshot_version: target.version,
          approver_email: actor,
          review_item_id: data.id,
          notes: data.reason ?? null,
        });
      }
    }

    // Also write to the global audit log so the project-level audit view sees it.
    if (projId) {
      await sb.from("engine_audit_log").insert({
        project_id: projId,
        actor_email: actor,
        action: `review_${data.action}`,
        summary: `Review "${it.title}" (${it.item_type}) → ${data.action}${data.reason ? ` — ${data.reason}` : ""}.`,
        affected_modules: ["review"],
        target_id: data.id,
        metadata: { item_type: it.item_type, action: data.action, reason: data.reason ?? null },
      });
    }
    return { ok: true };
  });

// ─── Execution Alerts (computed) ────────────────────────────────
export type ExecAlert = {
  id: string;
  kind: "blocked_decision" | "missing_file" | "overdue_approval" | "delivery_health";
  client: string;
  title: string;
  detail: string;
  age_days: number;
  severity: "high" | "medium";
  action: string;
};

export const getExecutionAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExecAlert[]> => {
    await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => {
          order?: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
          eq?: (c: string, v: string) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
          in?: (c: string, v: string[]) => Promise<{ data: unknown; error: unknown }>;
          lt?: (c: string, v: string) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    const alerts: ExecAlert[] = [];
    const now = Date.now();

    // Blocked decisions from change events
    const { data: ce } = await sb.from("engine_change_events")
      .select("id,project_id,title,body,severity,created_at,engine_projects(name)")
      .order!("created_at", { ascending: false }).limit(50);
    for (const e of (ce ?? []) as Array<{ id: string; title: string; body: string | null; severity: string | null; created_at: string; engine_projects: { name: string } | null }>) {
      if ((e.severity ?? "").toLowerCase() === "high" || (e.severity ?? "").toLowerCase() === "blocker") {
        alerts.push({
          id: `ce-${e.id}`, kind: "blocked_decision",
          client: e.engine_projects?.name ?? "Unknown",
          title: e.title, detail: e.body ?? "Blocking change event",
          age_days: Math.max(0, Math.round((now - Date.parse(e.created_at)) / 86400000)),
          severity: "high", action: "Open build",
        });
      }
    }

    // Overdue milestones (past due_date and not accepted/complete)
    const today = new Date().toISOString().slice(0, 10);
    const { data: ms } = await sb.from("engine_milestones")
      .select("id,name,due_date,status,engine_projects(name)")
      .lt!("due_date", today);
    for (const m of (ms ?? []) as Array<{ id: string; name: string; due_date: string; status: string | null; engine_projects: { name: string } | null }>) {
      const st = (m.status ?? "").toLowerCase();
      if (st === "complete" || st === "accepted" || st === "archived") continue;
      const age = Math.max(0, Math.round((now - Date.parse(m.due_date)) / 86400000));
      alerts.push({
        id: `ms-${m.id}`, kind: "overdue_approval",
        client: m.engine_projects?.name ?? "Unknown",
        title: m.name, detail: `Milestone past due by ${age}d`,
        age_days: age, severity: age >= 5 ? "high" : "medium", action: "Escalate",
      });
    }

    // Delivery health from delivery items in follow_up
    const { data: fu } = await sb.from("engine_delivery_items")
      .select("id,client,roadmap,updated_at,status")
      .eq!("status", "follow_up").limit(50);
    for (const d of (fu ?? []) as Array<{ id: string; client: string; roadmap: string; updated_at: string }>) {
      const age = Math.max(0, Math.round((now - Date.parse(d.updated_at)) / 86400000));
      alerts.push({
        id: `dl-${d.id}`, kind: "delivery_health",
        client: d.client, title: `${d.roadmap} awaiting reply`,
        detail: `No response for ${age}d`,
        age_days: age, severity: age >= 5 ? "high" : "medium", action: "Follow up",
      });
    }

    return alerts;
  });

// ─── Project Agents ─────────────────────────────────────────────
export type ProjectAgent = {
  id: string;
  name: string;
  status: string;
  health: string;
  template: string | null;
  model: string | null;
  policy: string;
  monthly_budget_cents: number;
  spend_month_cents: number;
  tasks_count: number;
  approval_pct: number | null;
  last_active_at: string | null;
};

export const listProjectAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProjectAgent[]> => {
    await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => { select: (s: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } };
    };
    const { data, error } = await sb.from("engine_project_agents")
      .select("*").order("spend_month_cents", { ascending: false });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    return (data ?? []) as ProjectAgent[];
  });

export const createProjectAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    name: z.string().min(2).max(120),
    template: z.string().min(1).max(80),
    model: z.string().min(1).max(80),
    policy: z.enum(["Draft only", "Propose updates", "Execute approved actions"]),
    monthly_budget_cents: z.number().int().min(1000).max(500000),
  }).parse(raw))
  .handler(async ({ data, context }): Promise<ProjectAgent> => {
    await assertAdminEmail(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => { select: (s: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
      };
    };
    const { data: row, error } = await sb.from("engine_project_agents").insert({
      name: data.name, template: data.template, model: data.model, policy: data.policy,
      monthly_budget_cents: data.monthly_budget_cents, status: "Draft", health: "Healthy",
      last_active_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    return row as ProjectAgent;
  });

// ─── Draft Roadmap Versions (review dashboard strip) ─────────────
export type DraftVersion = {
  id: string;
  project_id: string;
  project_name: string;
  version: string;
  label: string | null;
  status: string;
  client_preview_status: string;
  source: string | null;
  generation_provenance: Record<string, string> | null;
  signal_count: number;
  created_at: string;
  published_to_portal_at: string | null;
};

export const listDraftVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DraftVersion[]> => {
    await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => {
          in: (c: string, v: string[]) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } };
          eq?: (c: string, v: string) => Promise<{ data: unknown; error: unknown; count: number | null }>;
        };
      };
    };
    const { data, error } = await sb
      .from("engine_roadmap_versions")
      .select("id,project_id,version,label,status,client_preview_status,generation_provenance,published_to_portal_at,created_at,engine_projects(name)")
      .in("status", ["ai_generated", "draft", "tai_edited"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const rows = (data ?? []) as Array<{
      id: string; project_id: string; version: string; label: string | null; status: string;
      client_preview_status: string; generation_provenance: Record<string, string> | null;
      published_to_portal_at: string | null; created_at: string;
      engine_projects: { name: string } | null;
    }>;
    // Best-effort signal count per project (cheap, one round trip)
    const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
    const signalCounts: Record<string, number> = {};
    if (projectIds.length) {
      const sbCount = context.supabase as never as {
        from: (t: string) => {
          select: (s: string, o: { count: "exact"; head: true }) => {
            eq: (c: string, v: string) => Promise<{ count: number | null; error: unknown }>;
          };
        };
      };
      await Promise.all(projectIds.map(async (pid) => {
        const { count } = await sbCount.from("engine_extracted_signals").select("id", { count: "exact", head: true }).eq("project_id", pid);
        signalCounts[pid] = count ?? 0;
      }));
    }
    return rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      project_name: r.engine_projects?.name ?? "Unknown project",
      version: r.version,
      label: r.label,
      status: r.status,
      client_preview_status: r.client_preview_status,
      source: (r.generation_provenance as { source?: string } | null)?.source ?? null,
      generation_provenance: r.generation_provenance,
      signal_count: signalCounts[r.project_id] ?? 0,
      created_at: r.created_at,
      published_to_portal_at: r.published_to_portal_at,
    }));
  });

// ─── Approval workflow: submit → approve → preview → publish ─────

async function _enqueueReviewItem(sb: {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
    select: (s: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { in: (c: string, v: string[]) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } } } };
  };
}, args: { project: string; item_type: string; title: string; impact: "high" | "medium" | "low"; requested_by: string; source?: string | null }) {
  await sb.from("engine_review_items").insert({
    project: args.project,
    item_type: args.item_type,
    title: args.title,
    impact: args.impact,
    source: args.source ?? null,
    requested_by: args.requested_by,
    status: "pending",
  });
}

export const submitVersionForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ versionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .select("id,status,version,project_id,engine_projects(name)")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const ver = v as { id: string; status: string; version: string; project_id: string; engine_projects: { name: string } | null };
    if (!["ai_generated", "draft", "tai_edited"].includes(ver.status)) {
      throw new Error(`Version is ${ver.status}; only drafts can be submitted for approval.`);
    }
    await sb.from("engine_roadmap_versions").update({ status: "tai_edited" }).eq("id", ver.id);
    await _enqueueReviewItem(sb as never, {
      project: ver.engine_projects?.name ?? "Unknown",
      item_type: "Roadmap Update",
      title: `Approve official version ${ver.version}`,
      impact: "high",
      requested_by: actor,
      source: `version:${ver.id}`,
    });
    await sb.from("engine_audit_log").insert({
      project_id: ver.project_id,
      actor_email: actor,
      action: "version_submitted_for_approval",
      summary: `${ver.version} submitted for Tai approval.`,
      version_id: ver.id,
      metadata: { version: ver.version },
    });
    return { ok: true };
  });

export const submitPreviewForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ versionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertOps(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .select("id,status,version,project_id,engine_projects(name)")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const ver = v as { id: string; status: string; version: string; project_id: string; engine_projects: { name: string } | null };
    if (ver.status !== "approved") {
      throw new Error("Version must be approved before submitting the client preview for review.");
    }
    await sb.from("engine_roadmap_versions").update({ client_preview_status: "draft" }).eq("id", ver.id);
    await _enqueueReviewItem(sb as never, {
      project: ver.engine_projects?.name ?? "Unknown",
      item_type: "Client Preview",
      title: `Approve client preview for ${ver.version}`,
      impact: "high",
      requested_by: actor,
      source: `version:${ver.id}`,
    });
    await sb.from("engine_audit_log").insert({
      project_id: ver.project_id,
      actor_email: actor,
      action: "client_preview_submitted",
      summary: `Client preview for ${ver.version} submitted for Tai approval.`,
      version_id: ver.id,
    });
    return { ok: true };
  });

export const approvePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ versionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertAdminEmail(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .select("id,status,client_preview_status,version,project_id")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const ver = v as { id: string; status: string; client_preview_status: string; version: string; project_id: string };
    if (ver.status !== "approved") throw new Error("Version must be approved first.");
    if (ver.client_preview_status !== "draft") throw new Error("Client preview must be submitted before it can be approved.");
    await sb.from("engine_roadmap_versions").update({
      client_preview_status: "approved",
      client_preview_approved_at: new Date().toISOString(),
      client_preview_approved_by: actor,
    }).eq("id", ver.id);
    await sb.from("engine_audit_log").insert({
      project_id: ver.project_id,
      actor_email: actor,
      action: "client_preview_approved",
      summary: `Client preview for ${ver.version} approved. Ready to publish.`,
      version_id: ver.id,
    });
    return { ok: true };
  });

export const publishVersionToPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ versionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const actor = await assertAdminEmail(context as never);
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => { select: (s: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
      };
    };
    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .select("id,status,client_preview_status,version,label,payload,project_id")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const ver = v as {
      id: string; status: string; client_preview_status: string; version: string;
      label: string | null; payload: Record<string, unknown> | null; project_id: string;
    };
    if (ver.status !== "approved") throw new Error("Only approved versions can be published to the client portal.");
    if (ver.client_preview_status !== "approved") throw new Error("Client preview must be approved before publishing.");

    // Resolve destination portal project
    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,client_preview,client_portal_project_id")
      .eq("id", ver.project_id)
      .single();
    if (pErr) throw new Error(String((pErr as { message?: string }).message ?? pErr));
    const project = proj as { id: string; name: string; client_preview: Record<string, unknown> | null; client_portal_project_id: string | null };
    if (!project.client_portal_project_id) {
      throw new Error("This engine project isn't linked to a client portal project yet. Set client_portal_project_id on engine_projects before publishing.");
    }

    const safe = buildClientSafePayload({
      title: project.name,
      version_label: ver.label ?? ver.version,
      payload: ver.payload,
      client_preview_override: project.client_preview,
    });

    const nowIso = new Date().toISOString();
    // Mark prior publications superseded (status → approved, not delivered)
    await (context.supabase as never as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
      };
    })
      .from("client_portal_roadmaps")
      .update({ status: "approved" })
      .eq("project_id", project.client_portal_project_id)
      .eq("status", "delivered");

    const { data: published, error: insErr } = await sb.from("client_portal_roadmaps").insert({
      project_id: project.client_portal_project_id,
      source_version_id: ver.id,
      title: safe.title,
      version_label: safe.version_label,
      status: "delivered",
      approved_at: nowIso,
      executive_summary: safe.executive_summary,
      current_diagnosis: safe.current_diagnosis,
      strategic_priorities: safe.strategic_priorities,
      sequence_30_60_90: safe.sequence_30_60_90,
      risks_dependencies: safe.risks_dependencies,
      recommended_next_move: safe.recommended_next_move,
      supporting_notes: safe.supporting_notes,
      metadata: { published_by: actor, engine_project_id: project.id },
    }).select("id").single();
    if (insErr) throw new Error(String((insErr as { message?: string }).message ?? insErr));
    const pub = published as { id: string };

    await sb.from("engine_roadmap_versions").update({
      published_to_portal_at: nowIso,
      published_portal_roadmap_id: pub.id,
    }).eq("id", ver.id);

    await sb.from("engine_audit_log").insert({
      project_id: ver.project_id,
      actor_email: actor,
      action: "version_published_to_portal",
      summary: `Published ${ver.version} to client portal.`,
      version_id: ver.id,
      metadata: { portal_roadmap_id: pub.id, portal_project_id: project.client_portal_project_id },
    });

    return { ok: true, portal_roadmap_id: pub.id };
  });
