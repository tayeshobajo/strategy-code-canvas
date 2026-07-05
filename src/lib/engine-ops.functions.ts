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
  project_id: string | null;
  client_portal_roadmap_id: string | null;
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
  portal_publish_status: "not_published" | "draft" | "published" | "archived";
  portal_share_url: string | null;
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
      .select("id,project_id,client,roadmap,version,status,channel,recipient,recipient_role,prepared_by,approved_by,last_action,updated_at,client_portal_roadmap_id,engine_delivery_history(id,from_status,to_status,note,at,actor),client_portal_roadmaps:client_portal_roadmap_id(status,share_url)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const rows = (data ?? []) as Array<DeliveryItem & {
      engine_delivery_history: DeliveryItem["history"];
      client_portal_roadmaps: { status: string | null; share_url: string | null } | null;
    }>;
    return rows.map((r) => {
      const s = (r.client_portal_roadmaps?.status ?? "").toLowerCase();
      const portal_publish_status: DeliveryItem["portal_publish_status"] = !r.client_portal_roadmaps
        ? "not_published"
        : s === "published" || s === "client_facing" || s === "delivered"
          ? "published"
          : s === "archived"
            ? "archived"
            : "draft";
      return {
        ...r,
        portal_publish_status,
        portal_share_url: r.client_portal_roadmaps?.share_url ?? null,
        history: (r.engine_delivery_history ?? []).slice().sort((a, b) => a.at.localeCompare(b.at)),
      };
    });
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
      .select("project,project_id,item_type,title,version_id").eq("id", data.id).single();
    if (rErr) throw new Error(String((rErr as { message?: string }).message ?? rErr));
    const it = item as { project: string; project_id: string | null; item_type: string; title: string; version_id: string | null };

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

// ─── Active Builds (Execution Tracker) ──────────────────────────
export type ActiveBuild = {
  id: string;
  client: string;
  roadmap: string;
  phase: string;
  progress: number;
  health: "on_track" | "at_risk" | "blocked";
  milestone: string;
  next_deadline: string | null;
};

export const listActiveBuilds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveBuild[]> => {
    await assertOps(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    const { data: projects, error } = await sb
      .from("engine_projects")
      .select("id,name,current_step,progress_pct,approved_version,roadmap_version,agent_status,status,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(String(error.message ?? error));

    const rows = (projects ?? []) as Array<{
      id: string; name: string; current_step: string | null; progress_pct: number | null;
      approved_version: string | null; roadmap_version: string | null;
      agent_status: string | null; status: string | null;
    }>;

    // Fetch next upcoming milestone per project (single round trip, in-memory group).
    const projectIds = rows.map((r) => r.id);
    let nextByProject: Record<string, { name: string; due_date: string | null; status: string | null }> = {};
    if (projectIds.length) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: ms } = await sb
        .from("engine_milestones")
        .select("project_id,name,due_date,status,sort_index")
        .in("project_id", projectIds)
        .not("status", "in", "(complete,accepted,archived)")
        .order("due_date", { ascending: true, nullsFirst: false });
      for (const m of (ms ?? []) as Array<{ project_id: string; name: string; due_date: string | null; status: string | null }>) {
        if (nextByProject[m.project_id]) continue;
        nextByProject[m.project_id] = { name: m.name, due_date: m.due_date, status: m.status };
      }
      // Health: any overdue open milestone → at_risk; any blocked change event → blocked
      const { data: overdue } = await sb
        .from("engine_milestones")
        .select("project_id")
        .in("project_id", projectIds)
        .lt("due_date", today)
        .not("status", "in", "(complete,accepted,archived)");
      const overdueSet = new Set(((overdue ?? []) as Array<{ project_id: string }>).map((o) => o.project_id));

      const { data: blockers } = await sb
        .from("engine_change_events")
        .select("project_id,severity")
        .in("project_id", projectIds)
        .in("severity", ["high", "blocker"]);
      const blockedSet = new Set(((blockers ?? []) as Array<{ project_id: string }>).map((b) => b.project_id));

      return rows.map((r) => {
        const next = nextByProject[r.id];
        const health: ActiveBuild["health"] = blockedSet.has(r.id)
          ? "blocked"
          : overdueSet.has(r.id) ? "at_risk" : "on_track";
        return {
          id: r.id,
          client: r.name,
          roadmap: r.approved_version ?? r.roadmap_version ?? "Draft",
          phase: r.current_step ?? "—",
          progress: Math.max(0, Math.min(100, r.progress_pct ?? 0)),
          health,
          milestone: next?.name ?? "—",
          next_deadline: next?.due_date ?? null,
        };
      });
    }
    return [];
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
}, args: { project_id: string; project: string; item_type: string; title: string; impact: "high" | "medium" | "low"; requested_by: string; source?: string | null }) {
  await sb.from("engine_review_items").insert({
    project_id: args.project_id,
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
      project_id: ver.project_id,
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
      project_id: ver.project_id,
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

/**
 * P1-5: Try to auto-link an engine project to its client portal project by
 * matching engine_clients.contact_email → client_portal_projects.primary_email.
 * On success, persists client_portal_project_id on engine_projects so subsequent
 * publishes are instant. Returns the resolved portal project id, or null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _tryAutoLinkPortalProject(sb: any, engineProjectId: string, clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data: client } = await sb
    .from("engine_clients")
    .select("contact_email")
    .eq("id", clientId)
    .maybeSingle();
  const email = ((client as { contact_email?: string | null } | null)?.contact_email ?? "").trim().toLowerCase();
  if (!email) return null;
  const { data: portal } = await sb
    .from("client_portal_projects")
    .select("id")
    .ilike("primary_email", email)
    .maybeSingle();
  const portalId = (portal as { id?: string } | null)?.id ?? null;
  if (!portalId) return null;
  await sb.from("engine_projects")
    .update({ client_portal_project_id: portalId })
    .eq("id", engineProjectId);
  return portalId;
}



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

    // Resolve destination portal project (auto-link when possible).
    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select("id,name,client_preview,client_portal_project_id,client_id")
      .eq("id", ver.project_id)
      .single();
    if (pErr) throw new Error(String((pErr as { message?: string }).message ?? pErr));
    const project = proj as {
      id: string; name: string; client_preview: Record<string, unknown> | null;
      client_portal_project_id: string | null; client_id: string | null;
    };
    let portalProjectId = project.client_portal_project_id;
    if (!portalProjectId) {
      portalProjectId = await _tryAutoLinkPortalProject(sb, project.id, project.client_id);
    }
    if (!portalProjectId) {
      throw new Error(
        "This engine project isn't linked to a client portal project yet. " +
        "Auto-link failed — no client_portal_projects row matches this project's client contact email. " +
        "Create/associate a portal project (or set client_portal_project_id manually) before publishing.",
      );
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
      .eq("project_id", portalProjectId)
      .eq("status", "delivered");

    const { data: published, error: insErr } = await sb.from("client_portal_roadmaps").insert({
      project_id: portalProjectId,
      approved_roadmap_version_id: ver.id,
      title: safe.title,
      version_label: safe.version_label,
      status: "delivered",
      approved_at: nowIso,
      published_at: nowIso,
      published_by: actor,
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
      metadata: { portal_roadmap_id: pub.id, portal_project_id: portalProjectId },
    });

    return { ok: true, portal_roadmap_id: pub.id };
  });

// ─── Portal Link Management (P1-5 manual override) ──────────────────────
/**
 * Returns the current portal linkage for an engine project plus a shortlist
 * of candidate portal projects for the operator to pick from. Candidates are
 * ranked by email match first, then by name similarity, then recency.
 */
export const getProjectPortalLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertOps(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: proj, error } = await sb
      .from("engine_projects")
      .select("id,name,client_portal_project_id,client_id")
      .eq("id", data.projectId)
      .single();
    if (error) throw new Error(String(error.message ?? error));
    const project = proj as { id: string; name: string; client_portal_project_id: string | null; client_id: string | null };

    let linked: { id: string; project_name: string | null; primary_email: string | null } | null = null;
    if (project.client_portal_project_id) {
      const { data: l } = await sb
        .from("client_portal_projects")
        .select("id,project_name,primary_email")
        .eq("id", project.client_portal_project_id)
        .maybeSingle();
      linked = (l ?? null) as typeof linked;
    }

    let contactEmail: string | null = null;
    if (project.client_id) {
      const { data: c } = await sb
        .from("engine_clients")
        .select("contact_email")
        .eq("id", project.client_id)
        .maybeSingle();
      contactEmail = ((c as { contact_email?: string | null } | null)?.contact_email ?? null);
    }

    const { data: all } = await sb
      .from("client_portal_projects")
      .select("id,project_name,primary_email,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (all ?? []) as Array<{ id: string; project_name: string | null; primary_email: string | null; created_at: string }>;
    const emailNorm = (contactEmail ?? "").trim().toLowerCase();
    const nameNorm = project.name.trim().toLowerCase();
    const scored = list.map((p) => {
      const em = (p.primary_email ?? "").trim().toLowerCase();
      const nm = (p.project_name ?? "").trim().toLowerCase();
      let score = 0;
      if (emailNorm && em === emailNorm) score += 100;
      else if (emailNorm && em.split("@")[1] && emailNorm.split("@")[1] && em.split("@")[1] === emailNorm.split("@")[1]) score += 10;
      if (nameNorm && nm === nameNorm) score += 50;
      else if (nameNorm && nm.includes(nameNorm)) score += 20;
      return { ...p, score };
    }).sort((a, b) => b.score - a.score).slice(0, 20);

    return {
      project_id: project.id,
      linked_portal_project_id: project.client_portal_project_id,
      linked,
      contact_email: contactEmail,
      candidates: scored,
    };
  });

/**
 * Manually set (or clear) an engine project's portal linkage. Writes an
 * audit-log entry so the change is traceable.
 */
export const setProjectPortalLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      portalProjectId: z.string().uuid().nullable(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertAdminEmail(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    if (data.portalProjectId) {
      const { data: portal, error } = await sb
        .from("client_portal_projects")
        .select("id,project_name")
        .eq("id", data.portalProjectId)
        .maybeSingle();
      if (error) throw new Error(String(error.message ?? error));
      if (!portal) throw new Error("Portal project not found.");
    }

    const { error: uErr } = await sb
      .from("engine_projects")
      .update({ client_portal_project_id: data.portalProjectId })
      .eq("id", data.projectId);
    if (uErr) throw new Error(String(uErr.message ?? uErr));

    // Keep existing review items in sync so filter/join works.
    await sb
      .from("engine_review_items")
      .update({ client_portal_project_id: data.portalProjectId })
      .eq("project_id", data.projectId);

    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: actor,
      action: data.portalProjectId ? "portal_link_set" : "portal_link_cleared",
      summary: data.portalProjectId
        ? `Portal project linked (${data.portalProjectId}).`
        : "Portal project link cleared.",
      metadata: { portal_project_id: data.portalProjectId },
    });

    return { ok: true, linked_portal_project_id: data.portalProjectId };
  });


// ─── Audit Log Surfacing ────────────────────────────────────────
type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };
export type AuditLogEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  summary: string | null;
  field_changed: string | null;
  old_value: JsonValue;
  new_value: JsonValue;
  reason: string | null;
  affected_modules: string[];
  version_id: string | null;
  target_id: string | null;
  metadata: JsonValue;
  created_at: string;
};

export const listProjectAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<AuditLogEntry[]> => {
    await assertOps(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_audit_log")
      .select("id,action,actor_email,summary,field_changed,old_value,new_value,reason,affected_modules,version_id,target_id,metadata,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    return (rows ?? []) as AuditLogEntry[];
  });

// ─── Portal roadmap publish status change (P3) ──────────────────
export const setPortalRoadmapStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalRoadmapId: z.string().uuid(),
      status: z.enum(["delivered", "approved", "archived"]),
      reason: z.string().max(500).optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const actor = await assertAdminEmail(context as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error: rErr } = await sb
      .from("client_portal_roadmaps")
      .select("id,status,project_id,approved_roadmap_version_id,approved_at,title,version_label")
      .eq("id", data.portalRoadmapId)
      .single();
    if (rErr) throw new Error(String((rErr as { message?: string }).message ?? rErr));
    const r = row as {
      id: string; status: string; project_id: string;
      approved_roadmap_version_id: string | null; approved_at: string | null;
      title: string | null; version_label: string | null;
    };
    if ((data.status === "delivered" || data.status === "approved")
        && (!r.approved_roadmap_version_id || !r.approved_at)) {
      throw new Error("Cannot mark as delivered/approved without a linked approved_roadmap_version_id and approved_at.");
    }
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "delivered" && !r.approved_at) patch.published_at = new Date().toISOString();
    const { error: uErr } = await sb
      .from("client_portal_roadmaps")
      .update(patch)
      .eq("id", data.portalRoadmapId);
    if (uErr) throw new Error(String((uErr as { message?: string }).message ?? uErr));

    // Find matching engine project id for audit log linkage.
    const { data: eng } = await sb
      .from("engine_projects")
      .select("id")
      .eq("client_portal_project_id", r.project_id)
      .maybeSingle();
    const engProjectId = (eng as { id?: string } | null)?.id ?? null;
    if (engProjectId) {
      await sb.from("engine_audit_log").insert({
        project_id: engProjectId,
        actor_email: actor,
        action: "portal_status_changed",
        summary: `Portal roadmap "${r.title ?? r.version_label ?? r.id}" ${r.status} → ${data.status}${data.reason ? ` — ${data.reason}` : ""}.`,
        field_changed: "client_portal_roadmaps.status",
        old_value: r.status,
        new_value: data.status,
        reason: data.reason ?? null,
        version_id: r.approved_roadmap_version_id,
        target_id: r.id,
        metadata: { portal_roadmap_id: r.id, portal_project_id: r.project_id },
      });
    }
    return { ok: true, status: data.status };
  });
