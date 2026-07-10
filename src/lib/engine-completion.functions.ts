/* eslint-disable @typescript-eslint/no-explicit-any */
// Project Completion + v7 Delivery Package (publish-only) + Client Feedback
//
// Boundaries:
//  - completeProject: admin-only. Requires an approved roadmap version.
//    Sets engine_projects.status='completed', completed_at, completed_by_email.
//  - prepareDeliveryPackage: admin-only. Requires latest delivery readiness
//    review to be status='approved' AND readiness='ready_for_delivery_package'.
//    Publishes to client_portal_roadmaps. Does NOT notify the client.
//  - saveClientFeedback: admin/operator. Stores manual operator-entered
//    rating + feedback on engine_projects.delivery JSONB.
//
// Every mutation writes engine_audit_log + engine_activity.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
  return (email ?? "unknown").toLowerCase();
}

async function assertOps(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const admin = await hasRoleForEmail(context.supabase, email, "admin");
  if (admin) return (email ?? "unknown").toLowerCase();
  const op = await hasRoleForEmail(context.supabase, email, "operator");
  if (!op) throw new Error("Forbidden: admin or operator role required");
  return (email ?? "unknown").toLowerCase();
}

async function logAudit(
  sb: any,
  args: {
    project_id: string;
    actor_email: string;
    action: string;
    summary: string;
    target_id?: string | null;
    metadata?: Record<string, any>;
  },
) {
  try {
    await sb.from("engine_audit_log").insert({
      project_id: args.project_id,
      actor_email: args.actor_email,
      action: args.action,
      summary: args.summary.slice(0, 500),
      target_id: args.target_id ?? null,
      affected_modules: ["delivery", "completion"],
      metadata: args.metadata ?? {},
    });
  } catch {
    /* audit is best-effort */
  }
}

async function logActivity(
  sb: any,
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

// ============================================================
// completeProject
// ============================================================

export const completeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await assertAdmin(context);
    const sb = (context as any).supabase;

    const { data: proj, error: readErr } = await sb
      .from("engine_projects")
      .select("id,name,status,completed_at")
      .eq("id", data.projectId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!proj) throw new Error("Project not found");
    if (proj.completed_at) {
      throw new Error("Project is already marked complete.");
    }

    const { data: approved, error: verErr } = await sb
      .from("engine_roadmap_versions")
      .select("id,version")
      .eq("project_id", data.projectId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verErr) throw new Error(verErr.message);
    if (!approved) {
      throw new Error("Cannot complete a project without an approved roadmap version");
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await sb
      .from("engine_projects")
      .update({
        status: "completed",
        completed_at: nowIso,
        completed_by_email: actor,
      })
      .eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(sb, {
      project_id: data.projectId,
      actor_email: actor,
      action: "project_completed",
      summary: `Project "${proj.name}" marked complete.`,
      metadata: { approved_version_id: approved.id, completed_at: nowIso },
    });
    await logActivity(
      sb,
      data.projectId,
      "project_completed",
      "Project marked complete",
      `${actor} marked the project complete against approved version ${approved.version ?? approved.id}.`,
    );

    return { success: true as const, projectId: data.projectId, completedAt: nowIso };
  });

// ============================================================
// prepareDeliveryPackage — v7 publish-only (no client notification)
// ============================================================

export const prepareDeliveryPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await assertAdmin(context);
    const sb = (context as any).supabase;

    // Gate 1: latest readiness review must be approved + ready.
    const { data: review, error: rvErr } = await sb
      .from("engine_project_delivery_readiness_reviews")
      .select("id,status,readiness,recommendation")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rvErr) throw new Error(rvErr.message);
    if (
      !review ||
      review.status !== "approved" ||
      review.readiness !== "ready_for_delivery_package"
    ) {
      throw new Error("Project is not ready for delivery package preparation");
    }

    // Gate 2: approved roadmap version must exist with a locked snapshot.
    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select(
        "id,name,client_id,approved_snapshot,client_portal_project_id,delivery,roadmap",
      )
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error("Project not found");
    if (!proj.approved_snapshot || Object.keys(proj.approved_snapshot).length === 0) {
      throw new Error("Cannot prepare package: no approved roadmap snapshot on this project.");
    }

    const { data: approvedVersion, error: avErr } = await sb
      .from("engine_roadmap_versions")
      .select("id,version,payload,approved_at,client_preview_status")
      .eq("project_id", data.projectId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (avErr) throw new Error(avErr.message);
    if (!approvedVersion) {
      throw new Error("Cannot prepare package: no approved roadmap version row found.");
    }

    // Resolve client + recipient (for portal project linkage only; no email is sent).
    const { data: client } = await sb
      .from("engine_clients")
      .select("company,contact_email")
      .eq("id", proj.client_id)
      .maybeSingle();
    const deliveryPrev = (proj.delivery as Record<string, any> | null) ?? {};
    const recipientEmail: string | undefined = (
      deliveryPrev.recipient_email || client?.contact_email || ""
    )
      .toString()
      .trim()
      .toLowerCase() || undefined;
    if (!recipientEmail) {
      throw new Error(
        "Cannot prepare package: no recipient email on delivery or client record.",
      );
    }

    const nowIso = new Date().toISOString();

    // Find or create the client portal project keyed by primary_email.
    let portalProjectId: string | null =
      (proj.client_portal_project_id as string | null) ?? null;
    if (!portalProjectId) {
      const { data: existing } = await sb
        .from("client_portal_projects")
        .select("id")
        .ilike("primary_email", recipientEmail)
        .maybeSingle();
      if (existing?.id) {
        portalProjectId = existing.id;
      } else {
        const { data: created, error: cpErr } = await sb
          .from("client_portal_projects")
          .insert({
            primary_email: recipientEmail,
            contact_name: deliveryPrev.recipient_name ?? null,
            company_name: client?.company ?? null,
            portal_status: "roadmap_delivered",
            current_phase: "Roadmap delivered",
            owner_email: actor,
            access_granted_at: nowIso,
          })
          .select("id")
          .single();
        if (cpErr) throw new Error(cpErr.message);
        portalProjectId = created.id as string;
      }
      await sb
        .from("engine_projects")
        .update({ client_portal_project_id: portalProjectId })
        .eq("id", data.projectId);
    }

    // Ensure portal access grant.
    await sb.from("client_portal_permissions").upsert(
      {
        project_id: portalProjectId,
        email: recipientEmail,
        granted_by: actor,
        granted_at: nowIso,
        revoked_at: null,
      },
      { onConflict: "project_id,email" },
    );

    // Build client-safe body from approved snapshot.
    const snap = (proj.approved_snapshot as Record<string, any>) ?? {};
    const priorities: any[] = Array.isArray(snap.roadmap?.priorities)
      ? snap.roadmap.priorities
      : Array.isArray((proj.roadmap as any)?.priorities)
        ? (proj.roadmap as any).priorities
        : [];
    const execSummary: string =
      snap.client_preview?.executive_summary ||
      snap.roadmap?.summary ||
      (proj.roadmap as any)?.summary ||
      "";
    const bodyMd = [
      `# ${proj.name}`,
      execSummary ? `\n${execSummary}\n` : "",
      priorities.length
        ? "## Strategic priorities\n" +
          priorities
            .map(
              (p: any, i: number) =>
                `- **${p.title ?? p.name ?? `Priority ${i + 1}`}** — ${p.summary ?? p.description ?? ""}`,
            )
            .join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: doc, error: docErr } = await sb
      .from("roadmap_documents")
      .insert({
        client_email: recipientEmail,
        title: `${proj.name} — Approved Roadmap ${approvedVersion.version ?? ""}`.trim(),
        body_md: bodyMd,
        published_at: nowIso,
      })
      .select("id")
      .single();
    if (docErr) throw new Error(docErr.message);

    const { data: cpr, error: cprErr } = await sb
      .from("client_portal_roadmaps")
      .insert({
        project_id: portalProjectId,
        approved_roadmap_version_id: approvedVersion.id,
        roadmap_document_id: doc.id,
        title: `${proj.name} — Roadmap ${approvedVersion.version ?? ""}`.trim(),
        version_label: approvedVersion.version ?? "Version 1",
        status: "published",
        approved_at: nowIso,
        executive_summary: execSummary || null,
        strategic_priorities: priorities as any,
      })
      .select("id")
      .single();
    if (cprErr) throw new Error(cprErr.message);
    const portalRoadmapId = cpr.id as string;

    // Persist package marker on the engine project delivery JSONB (no status flip).
    const nextDelivery = {
      ...deliveryPrev,
      package_prepared_at: nowIso,
      package_prepared_by: actor,
      portal_roadmap_id: portalRoadmapId,
      portal_project_id: portalProjectId,
      recipient_email: recipientEmail,
    };
    await sb
      .from("engine_projects")
      .update({ delivery: nextDelivery })
      .eq("id", data.projectId);

    await logAudit(sb, {
      project_id: data.projectId,
      actor_email: actor,
      action: "delivery_package_prepared",
      summary: `Prepared delivery package for "${proj.name}" and published to portal (no client notification).`,
      target_id: portalRoadmapId,
      metadata: {
        project_delivered: false,
        portal_published: true,
        client_notified: false,
        readiness_review_id: review.id,
        approved_version_id: approvedVersion.id,
        portal_project_id: portalProjectId,
        portal_roadmap_id: portalRoadmapId,
      },
    });
    await logActivity(
      sb,
      data.projectId,
      "delivery_package_prepared",
      "Delivery package prepared",
      `${actor} published the approved roadmap to the client portal. Client has not been notified.`,
    );

    return {
      success: true as const,
      projectId: data.projectId,
      portalRoadmapId,
      portalProjectId,
    };
  });

// ============================================================
// saveClientFeedback — manual operator entry
// ============================================================

export const saveClientFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        feedback: z.string().max(4000).default(""),
        feedbackDate: z.string().min(1),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const actor = await assertOps(context);
    const sb = (context as any).supabase;

    const { data: proj, error: pErr } = await sb
      .from("engine_projects")
      .select("id,delivery")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proj) throw new Error("Project not found");

    const deliveryPrev = (proj.delivery as Record<string, any> | null) ?? {};
    const nextDelivery = {
      ...deliveryPrev,
      client_rating: data.rating,
      client_feedback: data.feedback,
      client_feedback_date: data.feedbackDate,
      client_feedback_recorded_at: new Date().toISOString(),
      client_feedback_recorded_by: actor,
    };
    const { error: upErr } = await sb
      .from("engine_projects")
      .update({ delivery: nextDelivery })
      .eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(sb, {
      project_id: data.projectId,
      actor_email: actor,
      action: "client_feedback_recorded",
      summary: `${actor} recorded client feedback (${data.rating}/5).`,
      metadata: {
        rating: data.rating,
        feedback_date: data.feedbackDate,
        manual_entry: true,
      },
    });
    await logActivity(
      sb,
      data.projectId,
      "client_feedback_recorded",
      "Client feedback recorded",
      `Rating ${data.rating}/5 recorded by ${actor} for ${data.feedbackDate}.`,
    );

    return { success: true as const };
  });
