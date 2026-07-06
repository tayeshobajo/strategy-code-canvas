/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { runIntelligencePipelineInternal } from "@/lib/engine-intelligence.functions";
import { writeDurableIntakeFailure } from "@/lib/engine-intake-failure-log";

async function assertOpsOrAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const sb = context.supabase;
  const isAdmin = await hasRoleForEmail(sb, email, "admin");
  if (isAdmin) return;
  const isOp = await hasRoleForEmail(sb, email, "operator");
  if (!isOp) throw new Error("Forbidden: admin or operator role required");
}

const SOURCE_TYPES = [
  "transcript",
  "brief",
  "website_url",
  "document",
  "screenshot",
  "email_note",
  "research_note",
  "competitor_url",
  "previous_roadmap",
] as const;

const DELIVERY_MODES = ["internal_only", "client_portal_required"] as const;
type DeliveryMode = (typeof DELIVERY_MODES)[number];

const CreateInput = z.object({
  // Pillar 1 — intake bridge. When the project originates from a public
  // intake submission, its id flows through so a durable submission →
  // project linkage is written (signal_room + intake review_audit_log).
  submissionId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  newClient: z
    .object({
      company: z.string().min(1).max(200),
      industry: z.string().max(120).optional(),
      contact_email: z.string().email().optional(),
      primary_contact: z.string().max(120).optional(),
    })
    .optional(),
  projectName: z.string().min(1).max(200),
  engagementType: z.string().max(120).optional(),
  roadmapType: z.string().max(120).optional(),
  primaryGoal: z.string().max(500).optional(),
  criticalDate: z.string().max(200).optional(),
  // G-4: explicit delivery-mode override. When omitted, derived from contact-email presence.
  deliveryMode: z.enum(DELIVERY_MODES).optional(),
  source: z.object({
    type: z.enum(SOURCE_TYPES),
    name: z.string().min(1).max(240),
    raw_text: z.string().max(200_000).optional(),
    url: z.string().url().optional(),
    storage_path: z.string().max(1024).optional(),
  }),
});


export type CreateProjectFromSourceResult = {
  project_id: string;
  source_id: string | null;
  version_id: string | null;
  version: string | null;
  status: "processing" | "blank";
};

export const createProjectFromSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ context, data }): Promise<CreateProjectFromSourceResult> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const actor = ((context as any).claims?.email as string | undefined) ?? null;

    if (!data.clientId && !data.newClient) {
      throw new Error("Either clientId or newClient is required");
    }

    // Rollback context — tracks rows CREATED by this call (vs pre-existing
    // rows matched by upserts) so rollbackHalfBornProject can clean up
    // portal/client siblings without ever destroying live client data.
    let createdClientId: string | null = null;
    let linkedPortalProjectId: string | null = null;
    let portalProjectCreated = false;
    let portalPermissionCreated = false;

    // Resolve client
    let clientId = data.clientId ?? "";
    let resolvedContactEmail: string | null =
      (data.newClient?.contact_email ?? "").trim().toLowerCase() || null;
    if (!clientId && data.newClient) {
      const { data: c, error } = await sb
        .from("engine_clients")
        .insert({
          company: data.newClient.company,
          industry: data.newClient.industry ?? null,
          contact_email: data.newClient.contact_email ?? null,
          primary_contact: data.newClient.primary_contact ?? null,
          owner_email: actor,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "client insert failed");
      clientId = c.id;
      createdClientId = c.id;
    } else if (clientId && !resolvedContactEmail) {
      // Existing client path — look up contact_email so delivery-mode inference works.
      const { data: c } = await sb
        .from("engine_clients")
        .select("contact_email")
        .eq("id", clientId)
        .maybeSingle();
      resolvedContactEmail =
        ((c?.contact_email as string | undefined) ?? "").trim().toLowerCase() || null;
    }

    // G-4: resolve delivery mode. Explicit input wins; otherwise derive from
    // contact-email presence. If the caller asks for client_portal_required
    // but we have no contact email to hang the portal linkage on, refuse
    // before any inserts run — this is the "half-born" case we're closing.
    const deliveryMode: DeliveryMode =
      data.deliveryMode ??
      (resolvedContactEmail ? "client_portal_required" : "internal_only");
    if (deliveryMode === "client_portal_required" && !resolvedContactEmail) {
      throw new Error(
        "Project creation failed integrity check: client_portal_required delivery mode needs a client contact_email to create the portal linkage.",
      );
    }

    // Create project (status = intake)
    const nowIso = new Date().toISOString();
    const { data: proj, error: projErr } = await sb
      .from("engine_projects")
      .insert({
        client_id: clientId,
        name: data.projectName,
        status: "intake",
        current_step: "signal",
        agent_status: "inactive",
        next_action: data.primaryGoal ?? "Awaiting source processing",
        last_activity_at: nowIso,
        delivery_mode: deliveryMode,
        signal_room: {
          engagement_type: data.engagementType ?? null,
          roadmap_type: data.roadmapType ?? null,
          primary_goal: data.primaryGoal ?? null,
          critical_date: data.criticalDate ?? null,
          // Durable submission → project linkage lives on the project row.
          intake_submission_id: data.submissionId ?? null,
        },
      })
      .select("id")
      .single();
    if (projErr) throw new Error(projErr.message ?? "project insert failed");
    const projectId = proj.id as string;


    // Log create
    await sb.from("engine_activity").insert({
      project_id: projectId,
      kind: "project_created",
      title: `Project created${actor ? ` by ${actor}` : ""}`,
      body: `Type: ${data.engagementType ?? "—"} · Goal: ${data.primaryGoal ?? "—"}`,
      severity: "info",
    });

    // ---- Stage B: ensure all sibling rows exist so no project is orphaned ----
    const integrityErrors: string[] = [];

    // 1. Default agent row
    {
      const { error } = await sb.from("engine_project_agents").insert({
        project_id: projectId,
        name: "Roadmap Agent",
        status: "Draft",
        health: "Healthy",
        policy: "Draft only",
      });
      if (error) integrityErrors.push(`engine_project_agents: ${error.message}`);
    }

    // 2. Default agent permissions row
    {
      const { error } = await sb.from("engine_agent_permissions").insert({
        project_id: projectId,
        permission_mode: "draft_only",
      });
      if (error) integrityErrors.push(`engine_agent_permissions: ${error.message}`);
    }

    // 3. v0.0 container roadmap version (parent for future AI drafts)
    {
      const { error } = await sb.from("engine_roadmap_versions").insert({
        project_id: projectId,
        version: "v0.0",
        status: "draft",
        created_by: "system",
        summary: "Project container — created at intake",
      });
      if (error && !/duplicate|unique/i.test(error.message ?? "")) {
        integrityErrors.push(`engine_roadmap_versions v0.0: ${error.message}`);
      }
    }

    // 4. Client portal linkage (upsert portal project + owner permission).
    // Only wire portal linkage when we have a contact email to hang it on.
    // For internal_only projects with no contact email, portal linkage is
    // intentionally absent and NOT considered an integrity failure.
    if (resolvedContactEmail) {
      // Record whether the portal project pre-exists BEFORE the upsert —
      // rollback may only delete a portal row this call created, never a
      // live portal matched by primary_email.
      const { data: preExistingPortal } = await sb
        .from("client_portal_projects")
        .select("id")
        .eq("primary_email", resolvedContactEmail)
        .maybeSingle();
      const { data: portalRow, error: upErr } = await sb
        .from("client_portal_projects")
        .upsert(
          {
            primary_email: resolvedContactEmail,
            contact_name: data.newClient?.primary_contact ?? null,
            company_name: data.newClient?.company ?? null,
            portal_status: "onboarding_pending",
            payment_status: "paid",
            current_phase: "Onboarding",
            owner_email: actor,
          },
          { onConflict: "primary_email" },
        )
        .select("id")
        .single();
      if (upErr) {
        integrityErrors.push(`client_portal_projects: ${upErr.message}`);
      } else if (portalRow?.id) {
        const portalId = portalRow.id as string;
        linkedPortalProjectId = portalId;
        portalProjectCreated = !preExistingPortal;
        const { error: linkErr } = await sb
          .from("engine_projects")
          .update({ client_portal_project_id: portalId })
          .eq("id", projectId);
        if (linkErr) integrityErrors.push(`engine_projects link: ${linkErr.message}`);

        const { data: preExistingPerm } = await sb
          .from("client_portal_permissions")
          .select("id")
          .eq("project_id", portalId)
          .eq("email", resolvedContactEmail)
          .maybeSingle();
        const { error: permErr } = await sb.from("client_portal_permissions").upsert(
          {
            project_id: portalId,
            email: resolvedContactEmail,
            role: "owner",
            granted_by: actor,
          },
          { onConflict: "project_id,email" },
        );
        if (permErr) integrityErrors.push(`client_portal_permissions: ${permErr.message}`);
        else portalPermissionCreated = !preExistingPerm;
      }
    }

    // G-4: hard integrity gate. Re-read the DB to confirm every required
    // sibling is present. Portal linkage is only required when the project's
    // resolved delivery_mode is client_portal_required. On any missing
    // required sibling, roll back the project row (FKs cascade what they
    // can; we explicitly delete siblings without CASCADE), log an
    // integrity_failure activity, and throw — no half-born projects.
    const failures = await assertProjectIntegrity(sb, projectId, deliveryMode);
    if (failures.length > 0) {
      const combined = [...integrityErrors, ...failures].join(" | ");
      // Pillar 2 — durable failure log. Writes to engine_project_intake_failures
      // FIRST (no FK to engine_projects, so it survives the rollback below).
      // The write goes through the service-role client: RLS grants
      // `authenticated` SELECT only, so the user-scoped `sb` cannot insert
      // here. The engine_activity insert is best-effort but will be wiped
      // when rollbackHalfBornProject cascades — that's exactly why the
      // dedicated failures table exists.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const durableLogError = await writeDurableIntakeFailure(supabaseAdmin, {
        attempted_project_id: projectId,
        attempted_project_name: data.projectName,
        attempted_client_id: clientId || null,
        actor_email: actor,
        delivery_mode: deliveryMode,
        failure_reason: combined,
        payload: {
          source_type: data.source?.type ?? null,
          engagement_type: data.engagementType ?? null,
          roadmap_type: data.roadmapType ?? null,
        },
      });
      if (durableLogError) {
        console.error("[intake] durable failure log write failed:", durableLogError);
      }
      try {
        await sb.from("engine_activity").insert({
          project_id: projectId,
          kind: "integrity_failure",
          title: "Project creation rolled back",
          body: combined,
          severity: "error",
        });
      } catch {
        /* audit log is best-effort */
      }
      const logNote = durableLogError
        ? ` (WARNING: durable failure log write also failed: ${durableLogError})`
        : "";
      await rollbackHalfBornProject(sb, projectId, {
        createdClientId,
        portalProjectId: linkedPortalProjectId,
        portalProjectCreated,
        portalPermissionCreated,
        contactEmail: resolvedContactEmail,
      });
      throw new Error(`Project creation failed integrity check: ${combined}${logNote}`);
    }


    // Non-fatal soft warnings from the sibling insert block (e.g. duplicate
    // v0.0 on a retry) — surface but do not block.
    if (integrityErrors.length > 0) {
      await sb.from("engine_activity").insert({
        project_id: projectId,
        kind: "integrity_warning",
        title: "Project created with non-fatal sibling warnings",
        body: integrityErrors.join(" | "),
        severity: "warning",
      });
    }

    // Pillar 1 — durable intake bridge. Runs only after the integrity gate
    // passes so a rolled-back project never leaves a bridge record. Writes:
    //  1. engine_activity (engine side, visible in the project feed);
    //  2. review_audit_log `bridged_to_engine` in the intake DB — the action
    //     the "Previously bridged" check on /ops/submissions/$id reads, which
    //     makes double-creation from one submission detectable.
    // Both are non-fatal: the project exists either way, and the linkage on
    // signal_room.intake_submission_id is already committed above.
    if (data.submissionId) {
      try {
        await sb.from("engine_activity").insert({
          project_id: projectId,
          kind: "intake_bridge",
          title: "Project created from intake submission",
          body: `Intake submission ${data.submissionId}`,
          severity: "info",
        });
      } catch {
        /* activity feed is best-effort */
      }
      try {
        const { getIntakeClient } = await import("@/integrations/intake/client.server");
        const { error: bridgeErr } = await getIntakeClient()
          .from("review_audit_log")
          .insert({
            submission_id: data.submissionId,
            actor_email: actor,
            action: "bridged_to_engine",
            metadata: { engine_project_id: projectId, project_name: data.projectName },
          });
        if (bridgeErr) {
          console.warn("[intake-bridge] review_audit_log write failed", bridgeErr);
        }
      } catch (e) {
        console.warn("[intake-bridge] review_audit_log write failed", e);
      }
    }


    // Insert source (unless blank source name is a marker for manual start)
    const hasContent =
      !!data.source.raw_text?.trim() || !!data.source.url || !!data.source.storage_path;

    if (!hasContent) {
      // Manual blank project — no pipeline run
      await sb
        .from("engine_projects")
        .update({ status: "draft" })
        .eq("id", projectId);
      return {
        project_id: projectId,
        source_id: null,
        version_id: null,
        version: null,
        status: "blank",
      };
    }

    const { data: srcRow, error: srcErr } = await sb
      .from("engine_sources")
      .insert({
        project_id: projectId,
        name: data.source.name,
        type: data.source.type,
        raw_text: data.source.raw_text ?? null,
        url: data.source.url ?? null,
        storage_path: data.source.storage_path ?? null,
        status: "queued",
        created_by_email: actor,
        visibility: "internal_only",
      })
      .select("id")
      .single();
    if (srcErr) throw new Error(srcErr.message ?? "source insert failed");

    // Fire-and-forget: run pipeline. Return immediately with processing status
    // so the UI can navigate and poll the extraction run.
    void (async () => {
      try {
        await runIntelligencePipelineInternal(sb, {
          projectId,
          sourceIds: [srcRow.id],
          actorEmail: actor,
        });
      } catch {
        /* errors are logged inside the pipeline */
      }
    })();

    return {
      project_id: projectId,
      source_id: srcRow.id,
      version_id: null,
      version: null,
      status: "processing",
    };
  });

/* ============================================================
 * Read helpers for the vertical slice
 * ============================================================ */

export type ExtractedSignalRow = {
  id: string;
  project_id: string;
  source_id: string | null;
  extraction_run_id: string | null;
  category: string;
  label: string;
  detail: string | null;
  confidence: number;
  client_safe: boolean;
  used_in_version_id: string | null;
  created_at: string;
};

export const listExtractedSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: ExtractedSignalRow[] }> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const { data: rows, error } = await sb
      .from("engine_extracted_signals")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "list signals failed");
    return { rows: (rows ?? []) as ExtractedSignalRow[] };
  });

export type ExtractionRunRow = {
  id: string;
  project_id: string;
  source_id: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  signals_count: number;
  cost_cents: number;
  produced_version_id: string | null;
  intake_summary: string | null;
  provider_intake: string | null;
  provider_structured: string | null;
  model_intake: string | null;
  model_structured: string | null;
  created_at: string;
};

export const listExtractionRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: ExtractionRunRow[] }> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const { data: rows, error } = await sb
      .from("engine_extraction_runs")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "list runs failed");
    return { rows: (rows ?? []) as ExtractionRunRow[] };
  });

export const listClientsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: Array<{ id: string; company: string; industry: string | null }> }> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const { data, error } = await sb
      .from("engine_clients")
      .select("id, company, industry")
      .order("company", { ascending: true });
    if (error) throw new Error(error.message ?? "list clients failed");
    return { rows: data ?? [] };
  });

/* ============================================================
 * G-4: internal integrity helpers used by createProjectFromSource
 * ============================================================ */

/**
 * assertProjectIntegrity — re-reads the DB and returns a list of missing
 * required siblings. Portal linkage is only required when deliveryMode is
 * client_portal_required. Empty array = OK.
 */
async function assertProjectIntegrity(
  sb: any,
  projectId: string,
  deliveryMode: DeliveryMode,
): Promise<string[]> {
  const missing: string[] = [];

  const { data: proj } = await sb
    .from("engine_projects")
    .select("id, client_portal_project_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) return ["engine_projects row missing"];

  const [{ count: agentCount }, { count: permCount }, { count: verCount }] = await Promise.all([
    sb.from("engine_project_agents").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    sb.from("engine_agent_permissions").select("project_id", { count: "exact", head: true }).eq("project_id", projectId),
    sb.from("engine_roadmap_versions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  if ((agentCount ?? 0) < 1) missing.push("engine_project_agents");
  if ((permCount ?? 0) < 1) missing.push("engine_agent_permissions");
  if ((verCount ?? 0) < 1) missing.push("engine_roadmap_versions (v0.0 container)");

  if (deliveryMode === "client_portal_required") {
    if (!proj.client_portal_project_id) {
      missing.push("engine_projects.client_portal_project_id link");
    } else {
      const [{ count: portalCount }, { count: ownerCount }] = await Promise.all([
        sb.from("client_portal_projects").select("id", { count: "exact", head: true }).eq("id", proj.client_portal_project_id),
        sb.from("client_portal_permissions").select("id", { count: "exact", head: true }).eq("project_id", proj.client_portal_project_id).is("revoked_at", null),
      ]);
      if ((portalCount ?? 0) < 1) missing.push("client_portal_projects");
      if ((ownerCount ?? 0) < 1) missing.push("client_portal_permissions (owner)");
    }
  }

  return missing;
}

/**
 * RollbackContext — which sibling rows THIS intake call created (as opposed
 * to pre-existing rows matched by upserts). Rollback deletes only rows the
 * call created, so it can never destroy a live client or portal.
 */
type RollbackContext = {
  /** engine_clients row inserted by this call (newClient path). */
  createdClientId?: string | null;
  /** Portal project id linked during this call. */
  portalProjectId?: string | null;
  /** true when the client_portal_projects row was created (not matched). */
  portalProjectCreated?: boolean;
  /** true when the owner client_portal_permissions row was created. */
  portalPermissionCreated?: boolean;
  /** Contact email the permission row was written for. */
  contactEmail?: string | null;
};

/**
 * rollbackHalfBornProject — deletes the just-created project and any sibling
 * rows that don't already CASCADE on engine_projects deletion, including the
 * portal shell (client_portal_projects / client_portal_permissions) and the
 * engine_clients row when they were created by this call — previously these
 * were orphaned, leaving a live-looking portal for a deleted project.
 * Best-effort on individual deletes so a partial rollback still removes as
 * much as possible; the caller throws after this returns.
 */
async function rollbackHalfBornProject(
  sb: any,
  projectId: string,
  ctx: RollbackContext = {},
): Promise<void> {
  // Explicit deletes for tables whose FKs may not cascade in every install.
  const targets: Array<{ table: string; column: string }> = [
    { table: "engine_project_agents", column: "project_id" },
    { table: "engine_agent_permissions", column: "project_id" },
    { table: "engine_roadmap_versions", column: "project_id" },
    { table: "engine_activity", column: "project_id" },
    { table: "engine_sources", column: "project_id" },
  ];
  for (const { table, column } of targets) {
    try {
      await sb.from(table).delete().eq(column, projectId);
    } catch {
      /* best-effort */
    }
  }
  // Remove the project row itself (before engine_clients — client_id FK).
  try {
    await sb.from("engine_projects").delete().eq("id", projectId);
  } catch {
    /* best-effort — if this fails, verifyProjectIntegrity will still flag the orphan */
  }

  // Portal + client cleanup runs through the service role: RLS on the portal
  // tables is scoped to client/operator flows, not this trusted rollback.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (ctx.portalProjectId) {
      if (ctx.portalProjectCreated) {
        // The whole portal project was born in this call — remove it and any
        // permissions hanging off it.
        await supabaseAdmin
          .from("client_portal_permissions")
          .delete()
          .eq("project_id", ctx.portalProjectId);
        await supabaseAdmin
          .from("client_portal_projects")
          .delete()
          .eq("id", ctx.portalProjectId);
      } else if (ctx.portalPermissionCreated && ctx.contactEmail) {
        // Pre-existing portal project: only remove the permission row this
        // call added; never touch the live portal itself.
        await supabaseAdmin
          .from("client_portal_permissions")
          .delete()
          .eq("project_id", ctx.portalProjectId)
          .eq("email", ctx.contactEmail);
      }
    }
    if (ctx.createdClientId) {
      await supabaseAdmin.from("engine_clients").delete().eq("id", ctx.createdClientId);
    }
  } catch (e) {
    console.warn("[intake] rollback portal/client cleanup failed", e);
  }
}

/* ============================================================
 * verifyProjectIntegrity — Stage B safety net
 * Reports which sibling rows a project is missing.
 * Honours engine_projects.delivery_mode (G-4): internal_only projects with
 * no portal linkage are OK, not failing.
 * ============================================================ */

export type ProjectIntegrityReport = {
  project_id: string;
  ok: boolean;
  delivery_mode: DeliveryMode | null;
  checks: {
    project: boolean;
    agent: boolean;
    agent_permissions: boolean;
    container_version: boolean;
    portal_project: boolean | null; // null = not applicable (internal_only)
    portal_owner_permission: boolean | null;
  };
  missing: string[];
};

export const verifyProjectIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectIntegrityReport> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const missing: string[] = [];

    const { data: proj } = await sb
      .from("engine_projects")
      .select("id, client_id, client_portal_project_id, delivery_mode")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) {
      return {
        project_id: data.projectId,
        ok: false,
        delivery_mode: null,
        checks: {
          project: false,
          agent: false,
          agent_permissions: false,
          container_version: false,
          portal_project: null,
          portal_owner_permission: null,
        },
        missing: ["engine_projects row not found"],
      };
    }

    const deliveryMode = (proj.delivery_mode as DeliveryMode | null) ?? "client_portal_required";

    const [{ count: agentCount }, { count: permCount }, { count: verCount }] = await Promise.all([
      sb.from("engine_project_agents").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
      sb.from("engine_agent_permissions").select("project_id", { count: "exact", head: true }).eq("project_id", data.projectId),
      sb.from("engine_roadmap_versions").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
    ]);

    const agent = (agentCount ?? 0) > 0;
    const agent_permissions = (permCount ?? 0) > 0;
    const container_version = (verCount ?? 0) > 0;
    if (!agent) missing.push("engine_project_agents");
    if (!agent_permissions) missing.push("engine_agent_permissions");
    if (!container_version) missing.push("engine_roadmap_versions");

    let portal_project: boolean | null = null;
    let portal_owner_permission: boolean | null = null;

    if (deliveryMode === "internal_only") {
      // Portal linkage intentionally absent for internal experiments.
      portal_project = null;
      portal_owner_permission = null;
    } else if (proj.client_portal_project_id) {
      portal_project = true;
      const { count: permCnt } = await sb
        .from("client_portal_permissions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", proj.client_portal_project_id)
        .is("revoked_at", null);
      portal_owner_permission = (permCnt ?? 0) > 0;
      if (!portal_owner_permission) missing.push("client_portal_permissions");
    } else {
      // client_portal_required but no linkage — that's the failure case.
      portal_project = false;
      portal_owner_permission = false;
      missing.push("client_portal_projects");
    }

    return {
      project_id: data.projectId,
      ok: missing.length === 0,
      delivery_mode: deliveryMode,
      checks: {
        project: true,
        agent,
        agent_permissions,
        container_version,
        portal_project,
        portal_owner_permission,
      },
      missing,
    };
  });


/* ============================================================
 * repairProjectIntegrity — Stage C safety net
 *
 * For an existing project that verifyProjectIntegrity flagged as incomplete,
 * insert only the SAFE missing siblings:
 *   - engine_project_agents  (default Roadmap Agent, draft-only)
 *   - engine_agent_permissions (draft_only)
 *   - engine_roadmap_versions v0.0 container
 *
 * Portal linkage (client_portal_projects + permissions) is intentionally NOT
 * auto-repaired here — it requires a real client contact email and belongs to
 * the intentional client-portal flow. Returns the post-repair integrity
 * report so the admin surface can decide next steps.
 * ============================================================ */

export type ProjectIntegrityRepairResult = {
  project_id: string;
  repaired: string[];
  still_missing: string[];
  report: ProjectIntegrityReport;
};

export const repairProjectIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectIntegrityRepairResult> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const actor = ((context as any).claims?.email as string | undefined) ?? null;
    const repaired: string[] = [];

    const { data: proj } = await sb
      .from("engine_projects")
      .select("id, delivery_mode")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const deliveryMode = (proj.delivery_mode as DeliveryMode | null) ?? "client_portal_required";

    // 1. Default agent row
    {
      const { count } = await sb
        .from("engine_project_agents")
        .select("id", { count: "exact", head: true })
        .eq("project_id", data.projectId);
      if ((count ?? 0) < 1) {
        const { error } = await sb.from("engine_project_agents").insert({
          project_id: data.projectId,
          name: "Roadmap Agent",
          status: "Draft",
          health: "Healthy",
          policy: "Draft only",
        });
        if (!error) repaired.push("engine_project_agents");
      }
    }

    // 2. Default agent permissions
    {
      const { count } = await sb
        .from("engine_agent_permissions")
        .select("project_id", { count: "exact", head: true })
        .eq("project_id", data.projectId);
      if ((count ?? 0) < 1) {
        const { error } = await sb.from("engine_agent_permissions").insert({
          project_id: data.projectId,
          permission_mode: "draft_only",
        });
        if (!error) repaired.push("engine_agent_permissions");
      }
    }

    // 3. v0.0 container roadmap version
    {
      const { count } = await sb
        .from("engine_roadmap_versions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", data.projectId);
      if ((count ?? 0) < 1) {
        const { error } = await sb.from("engine_roadmap_versions").insert({
          project_id: data.projectId,
          version: "v0.0",
          status: "draft",
          created_by: "system",
          summary: "Project container — created during integrity repair",
        });
        if (!error) repaired.push("engine_roadmap_versions v0.0");
      }
    }

    // Audit trail
    if (repaired.length > 0) {
      try {
        await sb.from("engine_activity").insert({
          project_id: data.projectId,
          kind: "integrity_repair",
          title: `Integrity repair by ${actor ?? "system"}`,
          body: `Repaired: ${repaired.join(", ")}`,
          severity: "info",
        });
      } catch {
        /* audit is best-effort */
      }
    }

    // Recompute report inline (same logic as verifyProjectIntegrity, but
    // without re-invoking the server fn wrapper).
    const missing: string[] = [];
    const [{ count: agentCount }, { count: permCount }, { count: verCount }] = await Promise.all([
      sb.from("engine_project_agents").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
      sb.from("engine_agent_permissions").select("project_id", { count: "exact", head: true }).eq("project_id", data.projectId),
      sb.from("engine_roadmap_versions").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
    ]);
    const agent = (agentCount ?? 0) > 0;
    const agent_permissions = (permCount ?? 0) > 0;
    const container_version = (verCount ?? 0) > 0;
    if (!agent) missing.push("engine_project_agents");
    if (!agent_permissions) missing.push("engine_agent_permissions");
    if (!container_version) missing.push("engine_roadmap_versions");

    let portal_project: boolean | null = null;
    let portal_owner_permission: boolean | null = null;
    const { data: proj2 } = await sb
      .from("engine_projects")
      .select("client_portal_project_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (deliveryMode === "internal_only") {
      portal_project = null;
      portal_owner_permission = null;
    } else if (proj2?.client_portal_project_id) {
      portal_project = true;
      const { count: permCnt } = await sb
        .from("client_portal_permissions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", proj2.client_portal_project_id)
        .is("revoked_at", null);
      portal_owner_permission = (permCnt ?? 0) > 0;
      if (!portal_owner_permission) missing.push("client_portal_permissions");
    } else {
      portal_project = false;
      portal_owner_permission = false;
      missing.push("client_portal_projects");
    }

    const report: ProjectIntegrityReport = {
      project_id: data.projectId,
      ok: missing.length === 0,
      delivery_mode: deliveryMode,
      checks: {
        project: true,
        agent,
        agent_permissions,
        container_version,
        portal_project,
        portal_owner_permission,
      },
      missing,
    };

    return {
      project_id: data.projectId,
      repaired,
      still_missing: missing,
      report,
    };
  });

/* ============================================================
 * listProjectsWithIntegrityIssues — admin surface data source
 * Returns projects that verifyProjectIntegrity would flag. Uses aggregate
 * queries to stay fast even with hundreds of projects.
 * ============================================================ */

export type IntegrityIssueRow = {
  project_id: string;
  project_name: string;
  delivery_mode: DeliveryMode;
  missing: string[];
};

export const listProjectsWithIntegrityIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: IntegrityIssueRow[] }> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;

    const { data: projects, error } = await sb
      .from("engine_projects")
      .select("id, name, delivery_mode, client_portal_project_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message ?? "list projects failed");

    const rows: IntegrityIssueRow[] = [];
    for (const p of (projects ?? []) as Array<{
      id: string;
      name: string | null;
      delivery_mode: DeliveryMode | null;
      client_portal_project_id: string | null;
    }>) {
      const deliveryMode = (p.delivery_mode as DeliveryMode | null) ?? "client_portal_required";
      const missing: string[] = [];
      const [{ count: agentCount }, { count: permCount }, { count: verCount }] = await Promise.all([
        sb.from("engine_project_agents").select("id", { count: "exact", head: true }).eq("project_id", p.id),
        sb.from("engine_agent_permissions").select("project_id", { count: "exact", head: true }).eq("project_id", p.id),
        sb.from("engine_roadmap_versions").select("id", { count: "exact", head: true }).eq("project_id", p.id),
      ]);
      if ((agentCount ?? 0) < 1) missing.push("engine_project_agents");
      if ((permCount ?? 0) < 1) missing.push("engine_agent_permissions");
      if ((verCount ?? 0) < 1) missing.push("engine_roadmap_versions");

      if (deliveryMode === "client_portal_required") {
        if (!p.client_portal_project_id) {
          missing.push("client_portal_projects");
        } else {
          const { count: ownerCount } = await sb
            .from("client_portal_permissions")
            .select("id", { count: "exact", head: true })
            .eq("project_id", p.client_portal_project_id)
            .is("revoked_at", null);
          if ((ownerCount ?? 0) < 1) missing.push("client_portal_permissions");
        }
      }

      if (missing.length > 0) {
        rows.push({
          project_id: p.id,
          project_name: p.name ?? "(untitled)",
          delivery_mode: deliveryMode,
          missing,
        });
      }
    }

    return { rows };
  });


/* ============================================================
 * listRecentIntakeFailures — Pillar 2 durable-failure view
 * Reads engine_project_intake_failures (survives project rollback).
 * ============================================================ */

export type IntakeFailureRow = {
  id: string;
  attempted_project_id: string | null;
  attempted_project_name: string | null;
  attempted_client_id: string | null;
  actor_email: string | null;
  delivery_mode: string | null;
  failure_reason: string;
  created_at: string;
};

export const listRecentIntakeFailures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: IntakeFailureRow[] }> => {
    await assertOpsOrAdmin(context);
    const sb = (context as any).supabase;
    const { data, error } = await sb
      .from("engine_project_intake_failures")
      .select(
        "id, attempted_project_id, attempted_project_name, attempted_client_id, actor_email, delivery_mode, failure_reason, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message ?? "list failures failed");
    return { rows: (data ?? []) as IntakeFailureRow[] };
  });




