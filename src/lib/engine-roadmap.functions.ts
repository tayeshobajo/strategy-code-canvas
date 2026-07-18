/**
 * Server functions for the Project Roadmap tab.
 *
 * Composes the roadmap read model from durable records (engine_projects,
 * engine_milestones, engine_roadmap_versions, engine_activity,
 * engine_review_items, engine_projects.parent_project_id). All privileged
 * writes go through requireSupabaseAuth + hasRoleForEmail.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine } from "@/lib/engine.functions";
import { isApprovedTruth } from "@/lib/spine-truth-status";
import { deriveRoadmapView, type RoadmapView } from "@/lib/roadmap-view";
import { insertEngineActivity } from "@/lib/engine-activity";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

async function assertOperator(context: {
  claims?: Record<string, unknown>;
  supabase: unknown;
}) {
  const email = context.claims?.email as string | undefined;
  const isOp = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  const isAdmin = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator role required");
  return { email, isAdmin };
}

export type ProjectRoadmapPayload = {
  project: {
    id: string;
    name: string;
    status: string;
    updated_at: string;
    health_score: number | null;
    parent_project_id: string | null;
    signals_count: number;
    progress_percent: number;
  };
  permissions: {
    can_edit_dates: boolean;
    can_add_milestone: boolean;
    can_approve_baseline: boolean;
    can_publish_client_safe: boolean;
    can_submit_change_request: boolean;
  };
  view: RoadmapView;
  versions: Array<{
    id: string;
    label: string | null;
    status: string;
    created_at: string;
    approved_at: string | null;
  }>;
};

export const getProjectRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: uuid, versionId: uuid.optional() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<ProjectRoadmapPayload> => {
    const { email, isAdmin } = await assertOperator(context);

    // Reuse the Spine payload — it already gathers milestones, gates, portal
    // publish, sources, truth statuses, etc.
    const spine = await getProjectSpine({ data: { id: data.id } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Parent project id + signals count
    const { data: projRow } = await sb
      .from("engine_projects")
      .select("id,parent_project_id")
      .eq("id", data.id)
      .maybeSingle();

    // Recent versions
    const { data: verRows } = await sb
      .from("engine_roadmap_versions")
      .select("id,label,status,created_at,approved_at,payload,approved_by")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const versions = (verRows ?? []) as Array<{
      id: string;
      label: string | null;
      status: string;
      created_at: string;
      approved_at: string | null;
      approved_by: string | null;
      payload: unknown;
    }>;
    const active = data.versionId
      ? versions.find((v) => v.id === data.versionId) ?? versions[0] ?? null
      : versions.find((v) => v.status === "approved") ?? versions[0] ?? null;
    const prior = active ? versions.find((v) => v.id !== active.id) : null;

    // Family — sibling / child projects sharing parent
    const parentId = (projRow?.parent_project_id as string | null) ?? null;
    let family: Array<{ id: string; name: string; status: "on_track" | "at_risk" | "blocked" }> = [];
    if (parentId) {
      const { data: sib } = await sb
        .from("engine_projects")
        .select("id,name,status,health_score")
        .eq("parent_project_id", parentId)
        .neq("id", data.id);
      const siblings = (sib ?? []) as Array<{ id: string; name: string; status: string; health_score: number | null }>;
      family = siblings.map((s) => ({
        id: s.id,
        name: s.name,
        status:
          s.status === "blocked"
            ? "blocked"
            : (s.health_score ?? 100) < 70
              ? "at_risk"
              : "on_track",
      }));
    }

    // Roadmap view
    const view = deriveRoadmapView({
      point_a_approved: isApprovedTruth(spine.project.point_a_status),
      point_b_approved: isApprovedTruth(spine.project.point_b_status),
      point_a_summary: spine.project.point_a
        ? {
            title: (spine.project.point_a as { title?: string })?.title ?? "Where we are today",
            description:
              (spine.project.point_a as { description?: string; summary?: string })?.description
              ?? (spine.project.point_a as { summary?: string })?.summary
              ?? null,
          }
        : null,
      point_b_summary: spine.project.point_b
        ? {
            title: (spine.project.point_b as { title?: string })?.title ?? "Where we are going",
            description:
              (spine.project.point_b as { description?: string; summary?: string })?.description
              ?? (spine.project.point_b as { summary?: string })?.summary
              ?? spine.project.goal
              ?? null,
          }
        : null,
      version: active
        ? {
            id: active.id,
            label: active.label ?? `v${versions.length}`,
            status: (active.status as "draft" | "approved" | "archived") ?? "draft",
            created_at: active.created_at,
            approved_at: active.approved_at,
            approved_by: active.approved_by,
            locked: active.status === "approved",
            payload: active.payload,
          }
        : null,
      milestones: spine.milestones.map((m) => ({
        ...m,
        // engine_milestones has these fields; SpineMilestone type doesn't
        // expose them yet. Cast through to enrich the view.
        start_date: (m as unknown as { start_date?: string | null }).start_date ?? null,
        owner: (m as unknown as { owner_email?: string | null }).owner_email ?? null,
      })),
      prior_version_payload: prior?.payload,
      activity: spine.activity,
      reviews: spine.reviews,
      family,
    });

    // Fire-and-forget: analytics event
    void insertEngineActivity(sb, {
      project_id: data.id,
      kind: "roadmap.view_opened",
      title: "Roadmap opened",
      severity: "info",
      actor_email: email ?? null,
    }).catch(() => {});

    // Progress = completed / total milestones
    const total = spine.milestones.length;
    const done = spine.milestones.filter(
      (m) => m.status === "complete" || m.status === "done",
    ).length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      project: {
        id: spine.project.id,
        name: spine.project.name,
        status: spine.project.status,
        updated_at: spine.project.updated_at,
        health_score: spine.project.health_score,
        parent_project_id: parentId,
        signals_count: spine.intelligence.signal_count,
        progress_percent: progress,
      },
      permissions: {
        can_edit_dates: isAdmin,
        can_add_milestone: true,
        can_approve_baseline: isAdmin,
        can_publish_client_safe: isAdmin,
        can_submit_change_request: true,
      },
      view,
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        status: v.status,
        created_at: v.created_at,
        approved_at: v.approved_at,
      })),
    };
  });

export const listRoadmapVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows } = await sb
      .from("engine_roadmap_versions")
      .select("id,label,status,created_at,approved_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false });
    return (rows ?? []) as Array<{
      id: string;
      label: string | null;
      status: string;
      created_at: string;
      approved_at: string | null;
    }>;
  });

export const compareRoadmapVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: uuid, fromId: uuid, toId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows } = await sb
      .from("engine_roadmap_versions")
      .select("id,label,status,payload,created_at,approved_at")
      .in("id", [data.fromId, data.toId])
      .eq("project_id", data.id);
    const list = (rows ?? []) as Array<{
      id: string;
      label: string | null;
      status: string;
      payload: unknown;
      created_at: string;
      approved_at: string | null;
    }>;
    const from = list.find((r) => r.id === data.fromId);
    const to = list.find((r) => r.id === data.toId);
    if (!from || !to) throw new Error("Version not found");

    const { diffVersions } = await import("@/lib/roadmap-view");
    const diff = diffVersions(to.payload, from.payload, []);
    return { from, to, diff };
  });

export const submitRoadmapChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: uuid,
        title: z.string().min(3),
        reason: z.string().min(3),
        urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
        scope_impact: z.string().optional(),
        date_impact: z.string().optional(),
        cost_impact: z.string().optional(),
        affected_milestone_ids: z.array(uuid).default([]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email } = await assertOperator(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("engine_review_items")
      .insert({
        project_id: data.id,
        item_type: "roadmap_change_request",
        title: data.title,
        impact: data.urgency,
        status: "pending",
        payload: {
          reason: data.reason,
          scope_impact: data.scope_impact ?? null,
          date_impact: data.date_impact ?? null,
          cost_impact: data.cost_impact ?? null,
          affected_milestone_ids: data.affected_milestone_ids,
          requested_by: email ?? null,
          requested_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message ?? "Failed to submit change request");
    await insertEngineActivity(sb, {
      project_id: data.id,
      kind: "roadmap.change_requested",
      title: `Change requested: ${data.title}`,
      severity: data.urgency === "critical" ? "critical" : "info",
      actor_email: email ?? null,
    }).catch(() => {});
    return { id: row.id as string };
  });
