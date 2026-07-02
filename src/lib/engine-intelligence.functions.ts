/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

/* ============================================================
 * Sources
 * ============================================================ */

export type EngineSource = {
  id: string;
  project_id: string;
  name: string;
  type: string;
  storage_path: string | null;
  url: string | null;
  raw_text: string | null;
  status: string;
  signals_count: number;
  confidence: number;
  used_in_version: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

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

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: EngineSource[] }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_sources")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "list sources failed");
    return { rows: (rows ?? []) as EngineSource[] };
  });

export const createSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(240),
        type: z.enum(SOURCE_TYPES),
        url: z.string().url().optional().nullable(),
        raw_text: z.string().max(200_000).optional().nullable(),
        storage_path: z.string().max(1024).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: row, error } = await sb
      .from("engine_sources")
      .insert({
        project_id: data.projectId,
        name: data.name,
        type: data.type,
        url: data.url ?? null,
        raw_text: data.raw_text ?? null,
        storage_path: data.storage_path ?? null,
        status: "queued",
        created_by_email: email,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message ?? "create source failed");
    return { id: row.id };
  });

export const removeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb.from("engine_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message ?? "remove failed");
    return { ok: true };
  });

export const reprocessSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_sources")
      .update({ status: "queued", error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "reprocess failed");
    return { ok: true };
  });

/* ============================================================
 * Versions
 * ============================================================ */

export type EngineRoadmapVersion = {
  id: string;
  project_id: string;
  version: string;
  status: string;
  created_by: string;
  source_ids: string[];
  summary: string | null;
  payload: any;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: EngineRoadmapVersion[] }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_roadmap_versions")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "list versions failed");
    return { rows: (rows ?? []) as EngineRoadmapVersion[] };
  });

function bumpVersion(current: string | null): string {
  if (!current) return "v0.1";
  const m = current.match(/^v?(\d+)\.(\d+)$/i);
  if (!m) return `${current}.1`;
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

export const approveVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true; version: string }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .update({ status: "approved", approved_by: email, approved_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("project_id, version")
      .single();
    if (error) throw new Error(error.message ?? "approve failed");
    await sb
      .from("engine_projects")
      .update({ approved_version: v.version, roadmap_version: v.version })
      .eq("id", v.project_id);
    await sb.from("engine_activity").insert({
      project_id: v.project_id,
      kind: "version_approved",
      title: `Version ${v.version} approved`,
      body: email ? `Approved by ${email}` : null,
      severity: "success",
    });
    return { ok: true, version: v.version };
  });

export const archiveVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_roadmap_versions")
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "archive failed");
    return { ok: true };
  });

/* ============================================================
 * Change events
 * ============================================================ */

export type EngineChangeEvent = {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  source_id: string | null;
  version_id: string | null;
  affected_module: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const listChangeEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: EngineChangeEvent[] }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_change_events")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message ?? "list changes failed");
    return { rows: (rows ?? []) as EngineChangeEvent[] };
  });

export const resolveChangeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_change_events")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "resolve failed");
    return { ok: true };
  });

/* ============================================================
 * Pipeline: reads all queued sources + current module state,
 * asks the AI for structured drafts + change events, creates a
 * new draft version, and updates change_events. Approved
 * modules are never overwritten in place.
 * ============================================================ */

export const runIntelligencePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(
    async ({ context, data }): Promise<{ version_id: string; version: string }> => {
      await assertAdmin(context);
      const sb = context.supabase as any;

      const { data: project } = await sb
        .from("engine_projects")
        .select(
          "id,name,roadmap_version,approved_version,signal_room,extraction,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview, engine_clients(company,industry)",
        )
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      const { data: sources } = await sb
        .from("engine_sources")
        .select("id,name,type,url,raw_text,storage_path,status")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false });

      const srcRows = (sources ?? []) as any[];

      // Mark all as processing
      if (srcRows.length) {
        await sb
          .from("engine_sources")
          .update({ status: "processing" })
          .eq("project_id", data.projectId)
          .in("id", srcRows.map((s) => s.id));
      }

      // Activity: pipeline started + stages
      const stages = [
        "reading",
        "extracting",
        "point_a",
        "point_b",
        "hidden_assets",
        "gap_map",
        "blueprint",
        "roadmap",
        "deadlines",
        "investment",
        "client_preview",
      ];
      await sb.from("engine_activity").insert({
        project_id: data.projectId,
        kind: "pipeline_started",
        title: "Intelligence update started",
        body: `${srcRows.length} sources`,
        severity: "info",
      });

      // Build prompt
      const sourceSummary = srcRows
        .map(
          (s, i) =>
            `[${i + 1}] (${s.type}) ${s.name}${s.url ? ` — ${s.url}` : ""}${
              s.raw_text ? `\n${s.raw_text.slice(0, 4000)}` : ""
            }`,
        )
        .join("\n\n");

      const system = `You are the Trust Tai Roadmap Intelligence Engine. Read the provided sources and produce a strictly-valid JSON roadmap draft. Never invent facts. When unknown, say "unknown". Confidence is 0-100. Keep language sentence-case, no em-dashes, no exclamation points.`;

      const user = `PROJECT: ${project.name} (${project.engine_clients?.company ?? "—"})
CURRENT APPROVED VERSION: ${project.approved_version ?? "none"}
CURRENT DRAFT: ${project.roadmap_version ?? "none"}

CURRENT MODULES (JSON, may be empty):
${JSON.stringify(
  {
    extraction: project.extraction,
    point_a: project.point_a,
    point_b: project.point_b,
    hidden_assets: project.hidden_assets,
    gap_map: project.gap_map,
    blueprint: project.blueprint,
    roadmap: project.roadmap,
    sequencing: project.sequencing,
    deadlines: project.deadlines,
    investment: project.investment,
    client_preview: project.client_preview,
  },
  null,
  2,
).slice(0, 12000)}

NEW SOURCES:
${sourceSummary || "(no new sources — refresh drafts from existing state)"}

Return JSON with this exact shape:
{
  "summary": "1-2 sentence description of what changed",
  "overall_confidence": 0-100,
  "modules": {
    "extraction": { "confidence": 0-100, "items": ["..."] },
    "point_a": { "confidence": 0-100, "diagnosis": "..." },
    "point_b": { "confidence": 0-100, "destination": "..." },
    "hidden_assets": { "confidence": 0-100, "assets": ["..."] },
    "gap_map": { "confidence": 0-100, "gaps": ["..."] },
    "blueprint": { "confidence": 0-100, "nodes": ["..."] },
    "roadmap": { "confidence": 0-100, "phases": [{"name":"","milestones":["..."]}] },
    "sequencing": { "confidence": 0-100, "order": ["..."] },
    "deadlines": { "confidence": 0-100, "critical": [{"label":"","due_on":""}] },
    "investment": { "confidence": 0-100, "range_low_usd": 0, "range_high_usd": 0, "notes": "" },
    "client_preview": { "confidence": 0-100, "executive_summary": "" }
  },
  "change_events": [
    { "kind": "new_info|conflict|opportunity|risk|deadline_change|scope_change|investment_impact|client_copy_affected",
      "title": "", "body": "", "severity": "info|warn|critical", "affected_module": "" }
  ]
}`;

      const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
      const ai = await callLovableAi(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.3 },
      );

      type PipelineOutput = {
        summary?: string;
        overall_confidence?: number;
        modules?: Record<string, any>;
        change_events?: Array<{
          kind: string;
          title: string;
          body?: string;
          severity?: string;
          affected_module?: string;
        }>;
      };
      const parsed = parseJsonOutput<PipelineOutput>(ai.text);
      if (!parsed) {
        await sb
          .from("engine_sources")
          .update({ status: "failed", error: "AI output not JSON" })
          .eq("project_id", data.projectId)
          .in("id", srcRows.map((s) => s.id));
        throw new Error("AI returned invalid JSON. Try again.");
      }

      // Stage activity log
      for (const stage of stages) {
        await sb.from("engine_activity").insert({
          project_id: data.projectId,
          kind: "pipeline_stage",
          title: stage,
          body: "Completed",
          severity: "info",
        });
      }

      const nextVersion = bumpVersion(project.roadmap_version ?? project.approved_version ?? null);

      const { data: version, error: vErr } = await sb
        .from("engine_roadmap_versions")
        .insert({
          project_id: data.projectId,
          version: nextVersion,
          status: "ai_generated",
          created_by: "ai",
          source_ids: srcRows.map((s) => s.id),
          summary: parsed.summary ?? "Draft updated from new sources.",
          payload: parsed.modules ?? {},
        })
        .select("id, version")
        .single();
      if (vErr) throw new Error(vErr.message ?? "version insert failed");

      // Update project draft pointer and module JSONB (draft state)
      const moduleUpdates: Record<string, any> = {
        roadmap_version: nextVersion,
      };
      const modKeyMap: Record<string, string> = {
        extraction: "extraction",
        point_a: "point_a",
        point_b: "point_b",
        hidden_assets: "hidden_assets",
        gap_map: "gap_map",
        blueprint: "blueprint",
        roadmap: "roadmap",
        sequencing: "sequencing",
        deadlines: "deadlines",
        investment: "investment",
        client_preview: "client_preview",
      };
      for (const [k, col] of Object.entries(modKeyMap)) {
        if (parsed.modules?.[k]) moduleUpdates[col] = parsed.modules[k];
      }
      await sb.from("engine_projects").update(moduleUpdates).eq("id", data.projectId);

      // Change events
      for (const ev of parsed.change_events ?? []) {
        await sb.from("engine_change_events").insert({
          project_id: data.projectId,
          kind: ev.kind,
          title: ev.title,
          body: ev.body ?? null,
          severity: ev.severity ?? "info",
          affected_module: ev.affected_module ?? null,
          version_id: version.id,
        });
      }

      // Mark sources processed with confidence
      if (srcRows.length) {
        const confidence = Math.min(100, Math.max(0, parsed.overall_confidence ?? 70));
        await sb
          .from("engine_sources")
          .update({
            status: "processed",
            confidence,
            used_in_version: nextVersion,
            signals_count: (parsed.change_events ?? []).length,
          })
          .eq("project_id", data.projectId)
          .in("id", srcRows.map((s) => s.id));
      }

      // Charge to project spend (cost estimate)
      await sb.rpc("noop", {}).catch(() => null); // no-op if not present
      const { data: proj } = await sb
        .from("engine_projects")
        .select("agent_spend_month_cents")
        .eq("id", data.projectId)
        .single();
      await sb
        .from("engine_projects")
        .update({
          agent_spend_month_cents: (proj?.agent_spend_month_cents ?? 0) + ai.cost_cents,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", data.projectId);

      await sb.from("engine_activity").insert({
        project_id: data.projectId,
        kind: "pipeline_completed",
        title: `Draft ${nextVersion} generated`,
        body: parsed.summary ?? null,
        severity: "success",
      });

      return { version_id: version.id, version: nextVersion };
    },
  );

/* ============================================================
 * File upload signed URL (uses engine-signals bucket)
 * ============================================================ */

export const createSourceUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        filename: z.string().min(1).max(200),
      })
      .parse(raw),
  )
  .handler(
    async ({ context, data }): Promise<{ path: string; token: string; upload_url: string }> => {
      await assertAdmin(context);
      const sb = context.supabase as any;
      const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${data.projectId}/sources/${Date.now()}-${safe}`;
      const { data: signed, error } = await sb.storage
        .from("engine-signals")
        .createSignedUploadUrl(path);
      if (error) throw new Error(error.message ?? "signed upload failed");
      return { path, token: signed.token, upload_url: signed.signedUrl };
    },
  );

export const getSourceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ path: z.string().min(1) }).parse(raw))
  .handler(async ({ context, data }): Promise<{ url: string }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: signed, error } = await sb.storage
      .from("engine-signals")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message ?? "signed url failed");
    return { url: signed.signedUrl };
  });
