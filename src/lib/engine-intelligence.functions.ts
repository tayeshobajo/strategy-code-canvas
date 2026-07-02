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

async function logAudit(
  sb: any,
  args: {
    project_id: string;
    actor_email: string | null;
    action: string;
    summary?: string | null;
    affected_modules?: string[];
    version_id?: string | null;
    target_id?: string | null;
    metadata?: Record<string, any>;
  },
) {
  try {
    await sb.from("engine_audit_log").insert({
      project_id: args.project_id,
      actor_email: args.actor_email,
      action: args.action,
      summary: args.summary ?? null,
      affected_modules: args.affected_modules ?? [],
      version_id: args.version_id ?? null,
      target_id: args.target_id ?? null,
      metadata: args.metadata ?? {},
    });
  } catch {
    /* audit failures never break the action */
  }
}

/* ============================================================
 * Sources
 * ============================================================ */

export type EngineSourceStage = {
  key: string;
  label: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  note?: string | null;
};

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
  current_stage: string | null;
  processing_stages: EngineSourceStage[];
  started_at: string | null;
  finished_at: string | null;
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
    // Fire-and-forget: extract signals so the new source populates.
    processSingleSource(sb, row.id).catch(() => null);
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
  .handler(async ({ context, data }): Promise<{ ok: true; signals: number; confidence: number }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const r = await processSingleSource(sb, data.id);
    return { ok: true, signals: r.signals, confidence: r.confidence };
  });

/* ------------------------------------------------------------------
 * Per-source stage tracking. Each stage has: key, label, status,
 * started_at, finished_at, error. Written progressively so the UI
 * polls and streams real progress.
 * ------------------------------------------------------------------ */

const SOURCE_STAGE_DEFS = [
  { key: "queued", label: "Queued" },
  { key: "fetch", label: "Fetching content" },
  { key: "extract", label: "Extracting signals with AI" },
  { key: "persist", label: "Persisting signals" },
  { key: "complete", label: "Complete" },
] as const;

type StageStatus = "queued" | "running" | "completed" | "failed" | "skipped";
type StageRow = {
  key: string;
  label: string;
  status: StageStatus;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  note?: string | null;
};

function initialStages(): StageRow[] {
  return SOURCE_STAGE_DEFS.map((s) => ({ key: s.key, label: s.label, status: "queued" }));
}

async function writeStage(
  sb: any,
  sourceId: string,
  stages: StageRow[],
  key: string,
  patch: Partial<StageRow>,
  extra: Record<string, any> = {},
) {
  const idx = stages.findIndex((s) => s.key === key);
  if (idx >= 0) stages[idx] = { ...stages[idx], ...patch };
  await sb
    .from("engine_sources")
    .update({
      processing_stages: stages,
      current_stage: patch.status === "running" ? key : undefined,
      ...extra,
    })
    .eq("id", sourceId);
}

async function processSingleSource(
  sb: any,
  sourceId: string,
): Promise<{ signals: number; confidence: number }> {
  const stages = initialStages();
  const now = () => new Date().toISOString();

  await sb
    .from("engine_sources")
    .update({
      status: "processing",
      error: null,
      processing_stages: stages,
      current_stage: "queued",
      started_at: now(),
      finished_at: null,
    })
    .eq("id", sourceId);

  const { data: src } = await sb
    .from("engine_sources")
    .select("id,project_id,name,type,url,raw_text,storage_path")
    .eq("id", sourceId)
    .single();
  if (!src) throw new Error("Source not found");

  await writeStage(sb, sourceId, stages, "queued", { status: "completed", finished_at: now() });

  // Stage 1: fetch content
  await writeStage(sb, sourceId, stages, "fetch", { status: "running", started_at: now() });
  let content = src.raw_text ?? "";
  try {
    if (!content && src.url) {
      const res = await fetch(src.url);
      const t = await res.text();
      content = t.slice(0, 60_000);
      await sb.from("engine_sources").update({ raw_text: content }).eq("id", sourceId);
    }
    if (!content && src.storage_path) {
      const { data: dl } = await sb.storage.from("engine-signals").download(src.storage_path);
      if (dl) {
        try {
          content = (await dl.text()).slice(0, 60_000);
          if (content) await sb.from("engine_sources").update({ raw_text: content }).eq("id", sourceId);
        } catch {
          content = `[binary asset ${src.name}]`;
        }
      }
    }
    await writeStage(sb, sourceId, stages, "fetch", {
      status: "completed",
      finished_at: now(),
      note: content ? `${content.length.toLocaleString()} chars` : "no textual content",
    });
  } catch (e: any) {
    const msg = e?.message ?? "fetch failed";
    await writeStage(sb, sourceId, stages, "fetch", { status: "failed", finished_at: now(), error: msg });
    await sb
      .from("engine_sources")
      .update({ status: "failed", error: msg, finished_at: now() })
      .eq("id", sourceId);
    throw e;
  }

  if (!content) {
    await writeStage(sb, sourceId, stages, "extract", { status: "skipped" });
    await writeStage(sb, sourceId, stages, "persist", { status: "skipped" });
    await writeStage(sb, sourceId, stages, "complete", { status: "completed", finished_at: now() });
    await sb
      .from("engine_sources")
      .update({ status: "processed", signals_count: 0, confidence: 30, current_stage: null, finished_at: now() })
      .eq("id", sourceId);
    return { signals: 0, confidence: 30 };
  }

  // Stage 2: extract with AI
  await writeStage(sb, sourceId, stages, "extract", { status: "running", started_at: now() });
  let parsed: { signals?: Array<{ text: string; module: string; importance?: string }>; confidence?: number };
  try {
    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    const ai = await callLovableAi(
      [
        {
          role: "system",
          content:
            "Extract concrete business signals from source material for a client roadmap. Return strict JSON only. Never invent. Confidence 0-100 reflects how much signal is present.",
        },
        {
          role: "user",
          content: `SOURCE: ${src.name} (${src.type})\n\n${content.slice(0, 30_000)}\n\nReturn JSON:\n{\n  "signals": [ { "text": "", "module": "point_a|point_b|hidden_assets|gap_map|blueprint|roadmap|deadlines|investment|client_preview", "importance": "low|medium|high" } ],\n  "confidence": 0\n}`,
        },
      ],
      { json: true, temperature: 0.2 },
    );
    parsed = parseJsonOutput(ai.text) ?? { signals: [], confidence: 40 };
    await writeStage(sb, sourceId, stages, "extract", {
      status: "completed",
      finished_at: now(),
      note: `${parsed.signals?.length ?? 0} signals · confidence ${Math.round(parsed.confidence ?? 40)}%`,
    });
  } catch (e: any) {
    const msg = e?.message ?? "ai failed";
    await writeStage(sb, sourceId, stages, "extract", { status: "failed", finished_at: now(), error: msg });
    await writeStage(sb, sourceId, stages, "persist", { status: "skipped" });
    await writeStage(sb, sourceId, stages, "complete", { status: "failed", finished_at: now() });
    await sb
      .from("engine_sources")
      .update({ status: "failed", error: msg, current_stage: null, finished_at: now() })
      .eq("id", sourceId);
    throw e;
  }

  // Stage 3: persist signals
  await writeStage(sb, sourceId, stages, "persist", { status: "running", started_at: now() });
  const count = parsed.signals?.length ?? 0;
  const confidence = Math.min(100, Math.max(0, parsed.confidence ?? 40));
  try {
    for (const s of (parsed.signals ?? []).slice(0, 25)) {
      await sb.from("engine_change_events").insert({
        project_id: src.project_id,
        kind: "new_info",
        title: s.text.slice(0, 200),
        body: `From: ${src.name}`,
        severity: s.importance === "high" ? "warn" : "info",
        affected_module: s.module ?? null,
        source_id: src.id,
      });
    }
    await writeStage(sb, sourceId, stages, "persist", {
      status: "completed",
      finished_at: now(),
      note: `${count} change events written`,
    });
  } catch (e: any) {
    const msg = e?.message ?? "persist failed";
    await writeStage(sb, sourceId, stages, "persist", { status: "failed", finished_at: now(), error: msg });
    await sb
      .from("engine_sources")
      .update({ status: "failed", error: msg, current_stage: null, finished_at: now() })
      .eq("id", sourceId);
    throw e;
  }

  // Stage 4: complete
  await writeStage(sb, sourceId, stages, "complete", { status: "completed", finished_at: now() });
  await sb
    .from("engine_sources")
    .update({
      status: "processed",
      signals_count: count,
      confidence,
      current_stage: null,
      finished_at: now(),
    })
    .eq("id", sourceId);

  return { signals: count, confidence };
}


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

    // Guard: block approving if any critical change_event is still unresolved.
    const { data: openCritical } = await sb
      .from("engine_change_events")
      .select("id")
      .eq("project_id", (await sb.from("engine_roadmap_versions").select("project_id").eq("id", data.id).single()).data?.project_id)
      .eq("severity", "critical")
      .is("resolved_at", null);
    if ((openCritical ?? []).length) {
      throw new Error("Resolve open critical change events before approving.");
    }

    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .update({ status: "approved", approved_by: email, approved_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, project_id, version, payload")
      .single();
    if (error) throw new Error(error.message ?? "approve failed");

    // Snapshot the approved payload immutably on the project so any further
    // draft edits do not touch the last approved state.
    await sb
      .from("engine_projects")
      .update({
        approved_version: v.version,
        roadmap_version: v.version,
        approved_snapshot: v.payload ?? {},
        approved_at: new Date().toISOString(),
        approved_by_email: email,
      })
      .eq("id", v.project_id);
    await sb.from("engine_activity").insert({
      project_id: v.project_id,
      kind: "version_approved",
      title: `Version ${v.version} approved`,
      body: email ? `Approved by ${email}` : null,
      severity: "success",
    });
    await sb.from("roadmap_approvals").insert({
      version_id: v.id,
      project_id: v.project_id,
      snapshot_version: v.version,
      approver_email: email,
      notes: null,
    });
    await logAudit(sb, {
      project_id: v.project_id,
      actor_email: email,
      action: "version_approved",
      summary: `Approved ${v.version} and locked the approved snapshot.`,
      version_id: v.id,
      affected_modules: Object.keys(v.payload ?? {}),
      metadata: { version: v.version },
    });
    return { ok: true, version: v.version };
  });



export const archiveVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: v } = await sb
      .from("engine_roadmap_versions")
      .select("id,project_id,version,status")
      .eq("id", data.id)
      .single();
    if (v?.status === "approved") {
      throw new Error("Cannot archive the currently approved version. Approve a newer draft first.");
    }
    const { error } = await sb
      .from("engine_roadmap_versions")
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "archive failed");
    if (v) {
      await logAudit(sb, {
        project_id: v.project_id,
        actor_email: email,
        action: "version_archived",
        summary: `Archived ${v.version}.`,
        version_id: v.id,
        metadata: { version: v.version },
      });
    }
    return { ok: true };
  });

/* ============================================================
 * Compare two versions module by module. Returns a per-module diff
 * shaped for the UI: which modules changed, which are identical.
 * ============================================================ */

export const compareVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ aId: z.string().uuid(), bId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows } = await sb
      .from("engine_roadmap_versions")
      .select("id,project_id,version,status,payload,created_by,created_at")
      .in("id", [data.aId, data.bId]);
    const a = (rows ?? []).find((r: any) => r.id === data.aId);
    const b = (rows ?? []).find((r: any) => r.id === data.bId);
    if (!a || !b) throw new Error("Version(s) not found");

    const modules = [
      "extraction",
      "point_a",
      "point_b",
      "hidden_assets",
      "gap_map",
      "blueprint",
      "roadmap",
      "sequencing",
      "deadlines",
      "investment",
      "client_preview",
    ];
    const diffs = modules.map((m) => {
      const av = a.payload?.[m];
      const bv = b.payload?.[m];
      const aStr = av ? JSON.stringify(av, null, 2) : "";
      const bStr = bv ? JSON.stringify(bv, null, 2) : "";
      return { module: m, changed: aStr !== bStr, a: aStr, b: bStr };
    });
    const email = (context as any).claims?.email ?? null;
    const changedMods = diffs.filter((d) => d.changed).map((d) => d.module);
    await logAudit(sb, {
      project_id: a.project_id ?? b.project_id ?? "",
      actor_email: email,
      action: "version_compared",
      summary: `Compared ${a.version} with ${b.version}. ${changedMods.length} module(s) differ.`,
      version_id: b.id,
      target_id: a.id,
      affected_modules: changedMods,
      metadata: { a: a.version, b: b.version },
    });
    return { a, b, diffs };
  });

/* ============================================================
 * Restore: create a new draft version from an older payload and
 * repoint project drafts to it. Approved snapshot is untouched.
 * ============================================================ */

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true; version: string }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: src } = await sb
      .from("engine_roadmap_versions")
      .select("id,project_id,version,payload,summary")
      .eq("id", data.id)
      .single();
    if (!src) throw new Error("Version not found");

    const { data: proj } = await sb
      .from("engine_projects")
      .select("roadmap_version,approved_version")
      .eq("id", src.project_id)
      .single();
    const nextVersion = bumpVersion(proj?.roadmap_version ?? proj?.approved_version ?? null);

    const { data: v, error } = await sb
      .from("engine_roadmap_versions")
      .insert({
        project_id: src.project_id,
        version: nextVersion,
        status: "tai_edited",
        created_by: email ?? "tai",
        source_ids: [],
        summary: `Restored from ${src.version}. ${src.summary ?? ""}`.trim(),
        payload: src.payload,
        parent_version_id: src.id,
      })
      .select("id,version")
      .single();
    if (error) throw new Error(error.message ?? "restore failed");

    // Repoint draft module state without touching approved_snapshot.
    const moduleUpdates: Record<string, any> = { roadmap_version: nextVersion };
    for (const k of [
      "extraction",
      "point_a",
      "point_b",
      "hidden_assets",
      "gap_map",
      "blueprint",
      "roadmap",
      "sequencing",
      "deadlines",
      "investment",
      "client_preview",
    ]) {
      if (src.payload?.[k]) moduleUpdates[k] = src.payload[k];
    }
    await sb.from("engine_projects").update(moduleUpdates).eq("id", src.project_id);

    await sb.from("engine_activity").insert({
      project_id: src.project_id,
      kind: "version_restored",
      title: `Restored ${src.version} as draft ${nextVersion}`,
      body: email ? `By ${email}` : null,
      severity: "info",
    });
    await logAudit(sb, {
      project_id: src.project_id,
      actor_email: email,
      action: "version_restored",
      summary: `Restored ${src.version} as new draft ${nextVersion}.`,
      version_id: v.id,
      target_id: src.id,
      affected_modules: Object.keys(src.payload ?? {}),
      metadata: { from: src.version, to: nextVersion },
    });
    return { ok: true, version: v.version };
  });

/* ============================================================
 * Restore a single module (section) from a source version into the
 * project's current draft. Approved snapshot untouched.
 * ============================================================ */

export const restoreVersionSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        sourceVersionId: z.string().uuid(),
        module: z.string().min(1).max(80),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: src } = await sb
      .from("engine_roadmap_versions")
      .select("id,project_id,version,payload")
      .eq("id", data.sourceVersionId)
      .single();
    if (!src) throw new Error("Version not found");
    const value = src.payload?.[data.module];
    if (value === undefined) throw new Error(`Module "${data.module}" is empty in ${src.version}.`);

    const patch: Record<string, any> = {};
    patch[data.module] = value;
    const { error } = await sb.from("engine_projects").update(patch).eq("id", src.project_id);
    if (error) throw new Error(error.message ?? "restore section failed");

    await sb.from("engine_activity").insert({
      project_id: src.project_id,
      kind: "section_restored",
      title: `Restored ${data.module.replace(/_/g, " ")} from ${src.version}`,
      body: email ? `By ${email}` : null,
      severity: "info",
    });
    await logAudit(sb, {
      project_id: src.project_id,
      actor_email: email,
      action: "section_restored",
      summary: `Restored the ${data.module.replace(/_/g, " ")} section from ${src.version} into the current draft.`,
      version_id: src.id,
      affected_modules: [data.module],
      metadata: { from: src.version, module: data.module },
    });
    return { ok: true };
  });

/* ============================================================
 * Audit log listing (admin-only via RLS + role check)
 * ============================================================ */

export type EngineAuditLog = {
  id: string;
  project_id: string;
  actor_email: string | null;
  action: string;
  summary: string | null;
  affected_modules: string[];
  version_id: string | null;
  target_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
};

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ rows: EngineAuditLog[] }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_audit_log")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message ?? "list audit failed");
    return { rows: (rows ?? []) as EngineAuditLog[] };
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

/* ============================================================
 * Intelligence Memory (global) — Priority 2
 * ============================================================ */

export type MemoryRow = {
  id: string;
  project_id: string | null;
  title: string;
  summary: string | null;
  type: string;
  source: string | null;
  source_date: string | null;
  captured_at: string;
  confidence: number;
  tags: string[];
  used_in: string | null;
  promoted_by: string | null;
  archived_at: string | null;
};

async function assertOpsOrAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const isAdmin = await hasRoleForEmail(context.supabase, email, "admin");
  if (isAdmin) return;
  const isOp = await hasRoleForEmail(context.supabase, email, "operator");
  if (!isOp) throw new Error("Forbidden: admin or operator role required");
}

export const listIntelligenceMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemoryRow[]> => {
    await assertOpsOrAdmin(context);
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("engine_intelligence_memory")
      .select("*")
      .is("archived_at", null)
      .order("captured_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message ?? "list memory failed");
    return (data ?? []) as MemoryRow[];
  });

export const upsertIntelligenceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      project_id: z.string().uuid().nullable().optional(),
      title: z.string().min(1),
      summary: z.string().nullable().optional(),
      type: z.string().min(1),
      source: z.string().nullable().optional(),
      source_date: z.string().nullable().optional(),
      confidence: z.number().int().min(0).max(100).optional(),
      tags: z.array(z.string()).optional(),
      used_in: z.string().nullable().optional(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    await assertOpsOrAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const payload: Record<string, any> = {
      project_id: data.project_id ?? null,
      title: data.title,
      summary: data.summary ?? null,
      type: data.type,
      source: data.source ?? null,
      source_date: data.source_date ?? null,
      confidence: data.confidence ?? 80,
      tags: data.tags ?? [],
      used_in: data.used_in ?? null,
      promoted_by: email,
    };
    if (data.id) {
      const { data: r, error } = await sb
        .from("engine_intelligence_memory")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message ?? "update memory failed");
      return { ok: true, id: r.id };
    }
    const { data: r, error } = await sb
      .from("engine_intelligence_memory")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message ?? "insert memory failed");
    return { ok: true, id: r.id };
  });

export const bulkReplaceIntelligenceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      removeIds: z.array(z.string().uuid()).default([]),
      inserts: z
        .array(
          z.object({
            project_id: z.string().uuid().nullable().optional(),
            title: z.string().min(1),
            summary: z.string().nullable().optional(),
            type: z.string().min(1),
            source: z.string().nullable().optional(),
            source_date: z.string().nullable().optional(),
            confidence: z.number().int().min(0).max(100).optional(),
            tags: z.array(z.string()).optional(),
            used_in: z.string().nullable().optional(),
          }),
        )
        .default([]),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; removed: number; inserted: number }> => {
    await assertOpsOrAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    let removed = 0;
    if (data.removeIds.length) {
      // Soft-archive to preserve history
      const { error } = await sb
        .from("engine_intelligence_memory")
        .update({ archived_at: new Date().toISOString() })
        .in("id", data.removeIds);
      if (error) throw new Error(error.message ?? "archive memory failed");
      removed = data.removeIds.length;
    }

    let inserted = 0;
    if (data.inserts.length) {
      const rows = data.inserts.map((r) => ({
        project_id: r.project_id ?? null,
        title: r.title,
        summary: r.summary ?? null,
        type: r.type,
        source: r.source ?? null,
        source_date: r.source_date ?? null,
        confidence: r.confidence ?? 80,
        tags: r.tags ?? [],
        used_in: r.used_in ?? null,
        promoted_by: email,
      }));
      const { data: ins, error } = await sb
        .from("engine_intelligence_memory")
        .insert(rows)
        .select("id");
      if (error) throw new Error(error.message ?? "insert memory failed");
      inserted = (ins ?? []).length;
    }

    return { ok: true, removed, inserted };
  });

export const deleteIntelligenceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_intelligence_memory")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "archive failed");
    return { ok: true };
  });
