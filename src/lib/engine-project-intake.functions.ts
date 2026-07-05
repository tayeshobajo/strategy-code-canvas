/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { runIntelligencePipelineInternal } from "@/lib/engine-intelligence.functions";

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

const CreateInput = z.object({
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

    // Resolve client
    let clientId = data.clientId ?? "";
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
        signal_room: {
          engagement_type: data.engagementType ?? null,
          roadmap_type: data.roadmapType ?? null,
          primary_goal: data.primaryGoal ?? null,
          critical_date: data.criticalDate ?? null,
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

    // 4. Client portal linkage (upsert portal project + owner permission)
    const contactEmail =
      (data.newClient?.contact_email ?? "").trim().toLowerCase() || null;
    if (contactEmail) {
      const { data: portalRow, error: upErr } = await sb
        .from("client_portal_projects")
        .upsert(
          {
            primary_email: contactEmail,
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
        const { error: linkErr } = await sb
          .from("engine_projects")
          .update({ client_portal_project_id: portalId })
          .eq("id", projectId);
        if (linkErr) integrityErrors.push(`engine_projects link: ${linkErr.message}`);

        const { error: permErr } = await sb
          .from("client_portal_permissions")
          .upsert(
            {
              project_id: portalId,
              email: contactEmail,
              role: "owner",
              granted_by: actor,
            },
            { onConflict: "project_id,email" },
          );
        if (permErr) integrityErrors.push(`client_portal_permissions: ${permErr.message}`);
      }
    }

    if (integrityErrors.length > 0) {
      await sb.from("engine_activity").insert({
        project_id: projectId,
        kind: "integrity_warning",
        title: "Project created with missing sibling rows",
        body: integrityErrors.join(" | "),
        severity: "warning",
      });
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
 * verifyProjectIntegrity — Stage B safety net
 * Reports which sibling rows a project is missing.
 * ============================================================ */

export type ProjectIntegrityReport = {
  project_id: string;
  ok: boolean;
  checks: {
    project: boolean;
    agent: boolean;
    agent_permissions: boolean;
    container_version: boolean;
    portal_project: boolean | null; // null = not applicable (no contact email)
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
      .select("id, client_id, client_portal_project_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) {
      return {
        project_id: data.projectId,
        ok: false,
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
    if (proj.client_portal_project_id) {
      portal_project = true;
      const { count: permCnt } = await sb
        .from("client_portal_permissions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", proj.client_portal_project_id)
        .is("revoked_at", null);
      portal_owner_permission = (permCnt ?? 0) > 0;
      if (!portal_owner_permission) missing.push("client_portal_permissions");
    } else if (proj.client_id) {
      // client exists but no portal link — check if the client has a contact email
      const { data: c } = await sb
        .from("engine_clients")
        .select("contact_email")
        .eq("id", proj.client_id)
        .maybeSingle();
      if (c?.contact_email) {
        portal_project = false;
        portal_owner_permission = false;
        missing.push("client_portal_projects");
      }
    }

    return {
      project_id: data.projectId,
      ok: missing.length === 0,
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

