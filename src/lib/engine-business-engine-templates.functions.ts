/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H3 — Business Engine templates (closes M3–M6, app + automation flow)
//
// Server functions:
//   - listEngineTemplates() — static template catalog (from
//     engine-business-engine-templates.ts).
//   - listTemplateInstances({ templateId? }) — what's already been cloned
//     into any project, so the admin can see coverage.
//   - proposeEngineFromTemplate({ templateId, projectId, ownerEmail? })
//     — creates a DRAFT engine_business_engines row with the template
//     workflow / triggers / approval rules / metrics / exception rules,
//     plus an engine_review_items row (item_type='engine_template_clone')
//     and audit + activity rows. Nothing running yet.
//   - approveEngineFromTemplate({ engineId, reviewItemId, ownerEmail,
//     approverEmail }) — activates via activate_business_engine() RPC.
//     Separate-approver enforced in code AND at the DB layer
//     (engine_business_engines_no_self_approve trigger).
//   - rejectEngineFromTemplate({ engineId, reviewItemId, reason }) —
//     archives the draft with reason.
//
// No schema changes. Templates live in code, instances live in the
// existing engine_business_engines table.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";
import {
  ENGINE_TEMPLATES,
  getTemplateById,
  type EngineTemplate,
} from "@/lib/engine-business-engine-templates";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

async function assertStaff(ctx: Ctx): Promise<string> {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return email;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
  return email;
}

// -------------------------------------------------------
// List templates + instances
// -------------------------------------------------------

export type TemplateInstance = {
  engineId: string;
  engineName: string;
  projectId: string;
  projectName: string | null;
  status: string;
  ownerEmail: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  templateId: string;
};

export type TemplateCatalogEntry = EngineTemplate & {
  instances: TemplateInstance[];
};

export const listEngineTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TemplateCatalogEntry[]> => {
    await assertStaff(context as Ctx);
    const sb = (context as Ctx).supabase;

    const { data: engines, error } = await sb
      .from("engine_business_engines")
      .select(
        "id, name, project_id, kind, status, owner_email, created_by, created_at, approved_by, approved_at, metadata",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const projectIds = Array.from(
      new Set((engines ?? []).map((e: any) => e.project_id).filter(Boolean)),
    );
    let projectNames = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await sb
        .from("engine_projects")
        .select("id, name")
        .in("id", projectIds);
      projectNames = new Map((projects ?? []).map((p: any) => [p.id, p.name]));
    }

    const byTemplate = new Map<string, TemplateInstance[]>();
    for (const e of engines ?? []) {
      const templateId =
        (e.metadata as any)?.template_id ??
        // Older instances (from proposeEnginePromotion) may not tag template_id.
        // Fall back to kind-based inference for the four canonical kinds.
        (["content_authority", "lead_followup", "review_reputation", "client_success"].includes(
          e.kind,
        )
          ? e.kind
          : null);
      if (!templateId) continue;
      const bucket = byTemplate.get(templateId) ?? [];
      bucket.push({
        engineId: e.id,
        engineName: e.name,
        projectId: e.project_id,
        projectName: projectNames.get(e.project_id) ?? null,
        status: e.status,
        ownerEmail: e.owner_email ?? null,
        createdBy: e.created_by ?? null,
        createdAt: e.created_at,
        approvedBy: e.approved_by ?? null,
        approvedAt: e.approved_at ?? null,
        templateId,
      });
      byTemplate.set(templateId, bucket);
    }

    return ENGINE_TEMPLATES.map((t) => ({
      ...t,
      instances: byTemplate.get(t.id) ?? [],
    }));
  });

// -------------------------------------------------------
// Propose engine from template
// -------------------------------------------------------

const ProposeInput = z.object({
  templateId: z.enum([
    "content_authority",
    "lead_followup",
    "review_reputation",
    "client_success",
  ]),
  projectId: z.string().uuid(),
  ownerEmail: z.string().email().optional().nullable(),
});

export const proposeEngineFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ProposeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const staffEmail = await assertStaff(context as Ctx);
    const sb = (context as Ctx).supabase;

    const template = getTemplateById(data.templateId);
    if (!template) throw new Error("Unknown template");

    // Project must exist
    const { data: project, error: pErr } = await sb
      .from("engine_projects")
      .select("id, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");

    // Duplicate check: one live instance of a given template per project.
    const { data: existing } = await sb
      .from("engine_business_engines")
      .select("id, status")
      .eq("project_id", data.projectId)
      .eq("kind", template.kind)
      .in("status", ["draft", "proposed", "approved", "active", "paused"]);
    if (existing && existing.length > 0) {
      throw new Error(
        `Project already has a ${template.name} instance (${existing[0].id.slice(0, 8)}, status ${existing[0].status}).`,
      );
    }

    const workflow = template.workflow.map((s) => ({
      type: "step",
      index: s.index,
      label: s.label,
      description: s.description,
      requires_approval: !!s.requires_approval,
      owner_role: s.owner_role ?? null,
      source: "template",
    }));

    const { data: engine, error: eErr } = await sb
      .from("engine_business_engines")
      .insert({
        project_id: data.projectId,
        kind: template.kind,
        name: template.name,
        outcome: template.outcome,
        cadence: template.cadence,
        cron_expression: template.cronExpression,
        owner_email: data.ownerEmail ?? null,
        workflow,
        triggers: template.triggers,
        approval_rules: template.approvalRules,
        metrics: template.metrics,
        exception_rules: template.exceptionRules,
        status: "draft",
        created_by: staffEmail,
        metadata: {
          template_id: template.id,
          template_version: "1",
          summary: template.summary,
          cloned_by: staffEmail,
          cloned_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (eErr) throw new Error(eErr.message);

    const { data: reviewItem, error: rErr } = await sb
      .from("engine_review_items")
      .insert({
        project_id: data.projectId,
        project: project.name,
        item_type: "engine_template_clone",
        title: `Activate template: ${template.name}`,
        impact: "high",
        source: "engine_template_clone",
        requested_by: staffEmail,
        status: "pending",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: staffEmail,
      action: "engine.template.proposed",
      summary: `Template "${template.name}" cloned as draft engine`,
      target_id: engine.id,
      affected_modules: ["business_engines"],
      metadata: {
        template_id: template.id,
        engine_id: engine.id,
        review_item_id: reviewItem.id,
        cadence: template.cadence,
      },
    });

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "engine.template.proposed",
      title: `Engine draft from template: ${template.name}`,
      body: `Draft engine created from ${template.name} template. Awaiting separate-approver activation.`,
      severity: "info",
    });

    return {
      engineId: engine.id as string,
      reviewItemId: reviewItem.id as string,
      templateId: template.id,
    };
  });

// -------------------------------------------------------
// Approve → activate
// -------------------------------------------------------

const ApproveInput = z.object({
  engineId: z.string().uuid(),
  reviewItemId: z.string().uuid(),
  ownerEmail: z.string().email(),
  approverEmail: z.string().email(),
});

export const approveEngineFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ApproveInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const sb = (context as Ctx).supabase;
    const callerEmail =
      ((context as Ctx).claims?.email as string | undefined)?.toLowerCase() ?? "";
    const approver = data.approverEmail.toLowerCase();
    if (approver !== callerEmail) {
      throw new Error("Approver email must match the signed-in user.");
    }

    const { data: engine, error: eErr } = await sb
      .from("engine_business_engines")
      .select("id, name, project_id, created_by, status, metadata")
      .eq("id", data.engineId)
      .single();
    if (eErr) throw new Error(eErr.message);
    if (!engine) throw new Error("Engine not found");
    if (engine.status === "active") throw new Error("Engine already active.");
    const creator = (engine.created_by ?? "").toLowerCase();
    if (creator && creator === approver) {
      throw new Error(
        "Self-approval forbidden: template cloner cannot activate their own engine.",
      );
    }

    const { error: actErr } = await sb.rpc("activate_business_engine", {
      _engine_id: data.engineId,
      _owner_email: data.ownerEmail,
    });
    if (actErr) throw new Error(actErr.message);

    await sb
      .from("engine_review_items")
      .update({ status: "approved" })
      .eq("id", data.reviewItemId);

    await sb.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: approver,
      action: "engine.template.approved",
      summary: `Engine "${engine.name}" activated from template`,
      target_id: engine.id,
      affected_modules: ["business_engines"],
      field_changed: "status",
      old_value: { status: engine.status } as any,
      new_value: { status: "active" } as any,
      metadata: {
        template_id: (engine.metadata as any)?.template_id ?? null,
        review_item_id: data.reviewItemId,
        owner_email: data.ownerEmail,
        approver_email: approver,
      },
    });

    await sb.from("engine_activity").insert({
      project_id: engine.project_id,
      kind: "engine.template.approved",
      title: `Engine activated from template: ${engine.name}`,
      body: `Approved by ${approver}. Owner: ${data.ownerEmail}.`,
      severity: "info",
    });

    return { ok: true as const, engineId: engine.id as string };
  });

// -------------------------------------------------------
// Reject → archive draft
// -------------------------------------------------------

const RejectInput = z.object({
  engineId: z.string().uuid(),
  reviewItemId: z.string().uuid(),
  reason: z.string().min(4).max(500),
});

export const rejectEngineFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RejectInput.parse(raw))
  .handler(async ({ data, context }) => {
    const staffEmail = await assertStaff(context as Ctx);
    const sb = (context as Ctx).supabase;

    const { data: engine, error: eErr } = await sb
      .from("engine_business_engines")
      .select("id, name, project_id, status, metadata")
      .eq("id", data.engineId)
      .single();
    if (eErr) throw new Error(eErr.message);
    if (!engine) throw new Error("Engine not found");
    if (engine.status === "active") {
      throw new Error("Cannot reject an active engine — pause or archive instead.");
    }

    const { error: uErr } = await sb
      .from("engine_business_engines")
      .update({
        status: "archived",
        metadata: {
          ...(engine.metadata ?? {}),
          rejected_by: staffEmail,
          rejected_at: new Date().toISOString(),
          rejection_reason: data.reason,
        },
      })
      .eq("id", data.engineId);
    if (uErr) throw new Error(uErr.message);

    await sb
      .from("engine_review_items")
      .update({ status: "rejected" })
      .eq("id", data.reviewItemId);

    await sb.from("engine_audit_log").insert({
      project_id: engine.project_id,
      actor_email: staffEmail,
      action: "engine.template.rejected",
      summary: `Engine draft "${engine.name}" rejected`,
      target_id: engine.id,
      affected_modules: ["business_engines"],
      reason: data.reason,
      metadata: {
        template_id: (engine.metadata as any)?.template_id ?? null,
        review_item_id: data.reviewItemId,
      },
    });

    return { ok: true as const, engineId: engine.id as string };
  });
