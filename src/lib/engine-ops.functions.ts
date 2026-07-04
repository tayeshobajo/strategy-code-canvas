import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

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
    const sb = context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
        update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { data: item, error: rErr } = await sb.from("engine_review_items")
      .select("project,item_type,title").eq("id", data.id).single();
    if (rErr) throw new Error(String((rErr as { message?: string }).message ?? rErr));
    const it = item as { project: string; item_type: string; title: string };
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
    // Also write to the global audit log so the project-level audit view sees it.
    const { data: proj } = await sb.from("engine_projects")
      .select("id").eq("name", it.project).single() as unknown as { data: { id: string } | null };
    if (proj?.id) {
      await sb.from("engine_audit_log").insert({
        project_id: proj.id,
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

    // Overdue milestones (past due_on and not accepted/complete)
    const today = new Date().toISOString().slice(0, 10);
    const { data: ms } = await sb.from("engine_milestones")
      .select("id,title,due_on,status,engine_projects(name)")
      .lt!("due_on", today);
    for (const m of (ms ?? []) as Array<{ id: string; title: string; due_on: string; status: string | null; engine_projects: { name: string } | null }>) {
      const st = (m.status ?? "").toLowerCase();
      if (st === "complete" || st === "accepted" || st === "archived") continue;
      const age = Math.max(0, Math.round((now - Date.parse(m.due_on)) / 86400000));
      alerts.push({
        id: `ms-${m.id}`, kind: "overdue_approval",
        client: m.engine_projects?.name ?? "Unknown",
        title: m.title, detail: `Milestone past due by ${age}d`,
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
