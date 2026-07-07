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
        // G-2: defense-in-depth. DB default is also 'internal_only' NOT NULL,
        // but setting it explicitly here means any future default change (or
        // a raw insert path that skips defaults) cannot silently leak a
        // client-safe row into the pipeline.
        visibility: "internal_only",
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

// Exported for behavioral tests — production callers are createSource /
// reprocessSource above, which gate on admin auth first.
export async function processSingleSource(
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
  let parsed: {
    signals?: Array<{ text: string; category?: string; module: string; importance?: string; confidence?: number }>;
    confidence?: number;
  };
  try {
    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    const { SIGNAL_CATEGORIES } = await import("@/lib/engine-ai-providers.server");
    const ai = await callLovableAi(
      [
        {
          role: "system",
          content:
            "Extract concrete business signals from source material for a client roadmap. Return strict JSON only. Never invent. Confidence 0-100 reflects how much signal is present.",
        },
        {
          role: "user",
          content: `SOURCE: ${src.name} (${src.type})\n\n${content.slice(0, 30_000)}\n\nReturn JSON:\n{\n  "signals": [ { "text": "", "category": "${SIGNAL_CATEGORIES.join("|")}", "module": "point_a|point_b|hidden_assets|gap_map|blueprint|roadmap|deadlines|investment|client_preview", "importance": "low|medium|high", "confidence": 0 } ],\n  "confidence": 0\n}`,
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
    const kept = (parsed.signals ?? []).slice(0, 25);
    for (const s of kept) {
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
    // Gap 8: the single-source path must feed the same categorized signal
    // store the full pipeline writes — otherwise extraction output only
    // reaches the change feed and never surfaces as step evidence.
    const { SIGNAL_CATEGORIES } = await import("@/lib/engine-ai-providers.server");
    const validCategories = new Set<string>(SIGNAL_CATEGORIES);
    const signalRows = kept
      .filter((s) => s.category && validCategories.has(s.category))
      .map((s) => ({
        project_id: src.project_id,
        source_id: src.id,
        category: s.category,
        label: s.text.slice(0, 500),
        detail: null,
        confidence: Math.min(100, Math.max(0, Math.round(s.confidence ?? confidence))),
        client_safe: false,
        metadata: { importance: s.importance ?? null, module: s.module ?? null },
      }));
    if (signalRows.length) {
      const { error: sigErr } = await sb.from("engine_extracted_signals").insert(signalRows);
      if (sigErr) throw new Error(sigErr.message ?? "extracted signals insert failed");
    }
    await writeStage(sb, sourceId, stages, "persist", {
      status: "completed",
      finished_at: now(),
      note: `${count} change events · ${signalRows.length} categorized signals written`,
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
    const email = ((context as any).claims?.email ?? "").toString().toLowerCase() || null;

    // Load the target version once — we need created_by + project_id.
    const { data: current, error: curErr } = await sb
      .from("engine_roadmap_versions")
      .select("id, project_id, created_by, status")
      .eq("id", data.id)
      .single();
    if (curErr || !current) throw new Error(curErr?.message ?? "version not found");
    if (current.status === "approved") {
      throw new Error("Version is already approved.");
    }

    // Self-approval guard: the same human who authored the version cannot approve it.
    // AI-authored versions (created_by = 'ai') are still allowed because the
    // approver is by definition a different actor (the human operator).
    const createdBy = (current.created_by ?? "").toString().toLowerCase();
    if (createdBy && createdBy !== "ai" && email && createdBy === email) {
      throw new Error("You cannot approve a version you authored yourself — a second reviewer must approve it.");
    }

    // Guard: block approving if any critical change_event is still unresolved.
    const { data: openCritical } = await sb
      .from("engine_change_events")
      .select("id")
      .eq("project_id", current.project_id)
      .eq("severity", "critical")
      .is("resolved_at", null);
    if ((openCritical ?? []).length) {
      throw new Error("Resolve open critical change events before approving.");
    }

    // Pillar 7: investment must be confirmed before a version can be approved.
    const { data: projRow } = await sb
      .from("engine_projects")
      .select("investment_confirmed_at")
      .eq("id", current.project_id)
      .single();
    if (!projRow?.investment_confirmed_at) {
      throw new Error("Confirm the investment on this project before approving the roadmap version.");
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
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        sourceIds: z.array(z.string().uuid()).optional(),
      })
      .parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ version_id: string; version: string; run_id: string; signals: number }> => {
      await assertAdmin(context);
      const sb = context.supabase as any;
      const actor = (context as any).claims?.email ?? null;
      return await runIntelligencePipelineInternal(sb, {
        projectId: data.projectId,
        sourceIds: data.sourceIds,
        actorEmail: actor,
      });
    },
  );

/**
 * Internal pipeline runner. Callable from server code (createProjectFromSource,
 * fire-and-forget). Uses the hybrid AI provider layer.
 */
export async function runIntelligencePipelineInternal(
  sb: any,
  args: { projectId: string; sourceIds?: string[]; actorEmail: string | null },
): Promise<{ version_id: string; version: string; run_id: string; signals: number }> {
  const { runIntakePass, runStructuredPass } = await import("@/lib/engine-ai-providers.server");

  const { data: project } = await sb
    .from("engine_projects")
    .select(
      "id,name,status,roadmap_version,approved_version,step_states,signal_room,extraction,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview, engine_clients(company,industry)",
    )
    .eq("id", args.projectId)
    .single();
  if (!project) throw new Error("Project not found");

  // Pillar 5: gate on engine_agent_permissions. A project whose operator
  // has explicitly blocked `run_intelligence_pipeline` (or is in draft_only
  // mode without an approve override) must not receive an auto-run — even
  // from the portal onboarding fire-and-forget path that uses supabaseAdmin.
  {
    const HARD_BLOCKED = new Set(["send_delivery", "move_project_to_execution"]);
    if (!HARD_BLOCKED.has("run_intelligence_pipeline")) {
      const { data: permRow } = await sb
        .from("engine_agent_permissions")
        .select("permission_mode,action_permissions")
        .eq("project_id", args.projectId)
        .maybeSingle();
      const mode: string = permRow?.permission_mode ?? "draft_only";
      const map: Record<string, string> = permRow?.action_permissions ?? {};
      let permission = (map["run_intelligence_pipeline"] ?? "allowed") as
        "allowed" | "needs_approval" | "blocked";
      // draft_only never downgrades an intelligence run — it's the default
      // capture path; only an explicit `blocked` should stop it. Keep the
      // block strict so operators have a real off-switch.
      if (permission === "blocked") {
        await sb.from("engine_activity").insert({
          project_id: args.projectId,
          kind: "pipeline_blocked",
          title: "Intelligence run blocked by agent permissions",
          body: `permission_mode=${mode}, run_intelligence_pipeline=blocked`,
          severity: "warn",
        });
        throw new Error("pipeline_blocked: run_intelligence_pipeline is blocked by agent permissions for this project.");
      }
    }
  }

  // HIGH FIX (Audit V3 #6): Budget-cap pre-check — replicate the agent-console
  // guard so the portal-onboarding service-role path can't spend unbounded
  // on a capped project. Same logic as engine-agent.functions.ts:112-121.
  {
    const { data: budgetRow, error: budgetErr } = await sb
      .from("engine_projects")
      .select("agent_budget_monthly_cents,agent_spend_month_cents")
      .eq("id", args.projectId)
      .single();
    if (budgetErr) {
      throw new Error(`Budget pre-check failed: ${budgetErr.message}`);
    }
    if (
      budgetRow?.agent_budget_monthly_cents &&
      (budgetRow.agent_spend_month_cents ?? 0) >= budgetRow.agent_budget_monthly_cents
    ) {
      await sb.from("engine_activity").insert({
        project_id: args.projectId,
        kind: "pipeline_blocked",
        title: "Intelligence run blocked — monthly budget cap reached",
        body: `spend=${budgetRow.agent_spend_month_cents ?? 0}¢, cap=${budgetRow.agent_budget_monthly_cents}¢`,
        severity: "warn",
      });
      throw new Error("Agent budget cap reached for this month. Raise the cap to continue.");
    }
  }

  // Pillar 11: only reversible/transitional statuses may be moved back to
  // source_processing / draft by an AI run. Terminal or hold states
  // (on_hold, blocked, paused, execution, delivered, archived) must survive
  // an intelligence refresh untouched — the review item is still the review
  // signal; the project's operator-truthful status stays put.
  const TRANSITIONAL_STATUSES = new Set(["intake", "source_processing", "draft"]);
  const priorStatus: string | null = (project.status ?? null) as string | null;
  const canMoveStatus = !priorStatus || TRANSITIONAL_STATUSES.has(priorStatus);

  // Select sources to process. If sourceIds passed, use those; else use all
  // sources for the project that aren't archived.
  let sourceQuery = sb
    .from("engine_sources")
    .select("id,name,type,url,raw_text,storage_path,status")
    .eq("project_id", args.projectId)
    .order("created_at", { ascending: false });
  if (args.sourceIds?.length) sourceQuery = sourceQuery.in("id", args.sourceIds);
  const { data: sources } = await sourceQuery;

  const srcRows = (sources ?? []) as any[];
  const primarySourceId = srcRows[0]?.id ?? null;

  // Insert extraction run row (status: running)
  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await sb
    .from("engine_extraction_runs")
    .insert({
      project_id: args.projectId,
      source_id: primarySourceId,
      status: "running",
      started_at: startedAt,
      metadata: { source_ids: srcRows.map((s) => s.id), prior_status: priorStatus },
    })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message ?? "extraction run insert failed");
  const runId = runRow.id as string;

  // Only flip the project into source_processing when it was in a
  // transitional state. Otherwise leave the operator-truthful status alone.
  if (canMoveStatus) {
    await sb
      .from("engine_projects")
      .update({ status: "source_processing", last_activity_at: startedAt })
      .eq("id", args.projectId);
  } else {
    await sb
      .from("engine_projects")
      .update({ last_activity_at: startedAt })
      .eq("id", args.projectId);
  }

  if (srcRows.length) {
    await sb
      .from("engine_sources")
      .update({ status: "processing" })
      .eq("project_id", args.projectId)
      .in("id", srcRows.map((s: any) => s.id));
  }


  await sb.from("engine_activity").insert({
    project_id: args.projectId,
    kind: "pipeline_started",
    title: "Intelligence update started",
    body: `${srcRows.length} source${srcRows.length === 1 ? "" : "s"} · hybrid AI (Gemini intake → Claude structured)`,
    severity: "info",
  });

  // Pull raw text for each source (download from storage if needed)
  const sourceTexts: string[] = [];
  for (const src of srcRows) {
    let content = src.raw_text ?? "";
    if (!content && src.url) {
      try {
        const res = await fetch(src.url);
        content = (await res.text()).slice(0, 60_000);
      } catch {
        content = "";
      }
    }
    if (!content && src.storage_path) {
      try {
        const { data: dl } = await sb.storage.from("engine-signals").download(src.storage_path);
        if (dl) content = (await dl.text()).slice(0, 60_000);
      } catch {
        content = `[binary asset ${src.name}]`;
      }
    }
    if (content && !src.raw_text) {
      await sb.from("engine_sources").update({ raw_text: content }).eq("id", src.id);
    }
    sourceTexts.push(content);
  }

  let intakeTotalCost = 0;
  let structuredCost = 0;
  let parsed: Awaited<ReturnType<typeof runStructuredPass>>;
  let intakeResults: Awaited<ReturnType<typeof runIntakePass>>[] = [];

  try {
    // Stage 1: intake pass (Gemini) for every source in parallel
    intakeResults = await Promise.all(
      srcRows.map((src, i) =>
        runIntakePass({ sourceName: src.name, sourceType: src.type, text: sourceTexts[i] ?? "" }),
      ),
    );
    intakeTotalCost = intakeResults.reduce((a, r) => a + r.cost_cents, 0);

    // Pillar 12: hydrate durable Intelligence Memory so the model treats
    // previously-captured facts as authoritative and doesn't re-derive them
    // from scratch on every run.
    const { data: memRows } = await sb
      .from("engine_intelligence_memory")
      .select("title,type,summary,confidence,source,captured_at")
      .or(`project_id.eq.${args.projectId},project_id.is.null`)
      .is("archived_at", null)
      .order("captured_at", { ascending: false })
      .limit(60);
    const priorMemory = (memRows ?? []) as Array<{
      title: string; type: string; summary: string | null;
      confidence: number | null; source: string | null; captured_at: string | null;
    }>;

    // Stage 2: structured pass (Claude) that produces signals + modules
    parsed = await runStructuredPass({
      projectName: project.name,
      clientCompany: project.engine_clients?.company ?? null,
      currentApprovedVersion: project.approved_version,
      currentDraftVersion: project.roadmap_version,
      currentModules: {
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
      intake: intakeResults,
      sources: srcRows.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url })),
      priorMemory,
    });
    structuredCost = parsed.cost_cents;
  } catch (e: any) {
    const msg = e?.message ?? "AI extraction failed";
    await sb
      .from("engine_extraction_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", runId);
    if (srcRows.length) {
      await sb
        .from("engine_sources")
        .update({ status: "failed", error: msg })
        .eq("project_id", args.projectId)
        .in("id", srcRows.map((s: any) => s.id));
    }
    if (canMoveStatus) {
      await sb.from("engine_projects").update({ status: "intake" }).eq("id", args.projectId);
    }
    await sb.from("engine_activity").insert({
      project_id: args.projectId,
      kind: "pipeline_failed",
      title: "Intelligence update failed",
      body: msg,
      severity: "critical",
    });
    await logAudit(sb, {
      project_id: args.projectId,
      actor_email: args.actorEmail,
      action: "pipeline_failed",
      summary: msg,
      metadata: { run_id: runId },
    });
    throw e;
  }

  const nextVersion = bumpVersion(project.roadmap_version ?? project.approved_version ?? null);
  const primarySourceName = srcRows[0]?.name ?? "existing state";
  const versionLabel = `${nextVersion} — AI draft from ${primarySourceName}${srcRows.length > 1 ? ` (+${srcRows.length - 1} more)` : ""}`;

  const { data: version, error: vErr } = await sb
    .from("engine_roadmap_versions")
    .insert({
      project_id: args.projectId,
      version: nextVersion,
      status: "ai_generated",
      created_by: "ai",
      source_ids: srcRows.map((s) => s.id),
      summary: parsed.summary,
      payload: parsed.modules ?? {},
      label: versionLabel,
      generation_provenance: {
        intake_provider: "lovable-gemini",
        intake_model: intakeResults[0]?.model ?? null,
        structured_provider: parsed.provider,
        structured_model: parsed.model,
        source_ids: srcRows.map((s) => s.id),
        run_id: runId,
        generated_at: new Date().toISOString(),
      },
    })
    .select("id, version")
    .single();
  if (vErr) throw new Error(vErr.message ?? "version insert failed");

  // Insert extracted signals
  const signalRows = (parsed.signals ?? []).map((sig) => ({
    project_id: args.projectId,
    source_id: primarySourceId,
    extraction_run_id: runId,
    category: sig.category,
    label: sig.label.slice(0, 500),
    detail: sig.detail?.slice(0, 4000) ?? null,
    confidence: Math.min(100, Math.max(0, Math.round(sig.confidence ?? 70))),
    client_safe: sig.client_safe ?? false,
    used_in_version_id: version.id,
    metadata: {},
  }));
  const insertedSignals: Array<{
    id: string; category: string; label: string;
    detail?: string | null; confidence?: number | null; client_safe?: boolean | null;
  }> = [];
  if (signalRows.length) {
    const { data: sigInserted } = await sb
      .from("engine_extracted_signals")
      .insert(signalRows)
      .select("id, category, label, detail, confidence, client_safe");
    for (const r of (sigInserted ?? []) as Array<{
      id: string; category: string; label: string;
      detail: string | null; confidence: number | null; client_safe: boolean | null;
    }>) {
      insertedSignals.push(r);
    }
  }

  // Pillar 12: auto-promote high-confidence signals into Intelligence Memory.
  // Memory is the project's durable, human-readable ledger — the next pipeline
  // run reads from it via priorMemory so facts survive re-generation. Dedupe
  // against existing rows for this project by normalized title so re-runs
  // don't multiply. Best-effort: never break the pipeline on memory failure.
  try {
    const MEMORY_THRESHOLD = 80;
    const CATEGORY_TO_TYPE: Record<string, string> = {
      goal: "Goal",
      pain: "Pain",
      opportunity: "Opportunity",
      deadline: "Deadline",
      constraint: "Constraint",
      decision_maker: "Stakeholder",
      hidden_asset: "Hidden Asset",
      risk: "Risk",
      required_system: "Requirement",
      milestone_candidate: "Milestone",
      investment_signal: "Investment",
      client_language: "Client Language",
      open_question: "Open Question",
      business_model: "Business Model",
      current_system: "Current System",
    };
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const eligible = insertedSignals.filter(
      (s) => (s.confidence ?? 0) >= MEMORY_THRESHOLD && s.category !== "milestone_candidate",
    );
    if (eligible.length) {
      const { data: existingMem } = await sb
        .from("engine_intelligence_memory")
        .select("title")
        .eq("project_id", args.projectId)
        .is("archived_at", null);
      const seen = new Set(
        ((existingMem ?? []) as Array<{ title: string }>).map((r) => norm(r.title)),
      );
      const memoryRows = eligible
        .filter((s) => !seen.has(norm(s.label)))
        .map((s) => ({
          project_id: args.projectId,
          signal_id: s.id,
          source_id: primarySourceId,
          title: s.label.slice(0, 240),
          summary: s.detail ?? null,
          type: CATEGORY_TO_TYPE[s.category] ?? "Insight",
          source: srcRows[0]?.name ?? null,
          confidence: Math.min(100, Math.max(0, Math.round(s.confidence ?? 80))),
          tags: [s.category],
          promoted_by: "ai:pipeline",
        }));
      if (memoryRows.length) {
        await sb.from("engine_intelligence_memory").insert(memoryRows);
      }
    }
  } catch (memErr) {
    console.warn("[runIntelligencePipeline] intelligence memory auto-write failed", memErr);
  }

  // Persist AI-drafted milestones into engine_milestones with source_evidence
  // so every milestone in the Builder traces back to the source(s) that
  // produced it. Only runs when the project has no existing milestones —
  // never overwrite operator-authored rows. On re-runs, we instead compute
  // suggested_milestone_changes (added/modified/removed) and stash them on
  // the version payload so Tai can review the diff and approve, rather than
  // silently mutating the approved roadmap.
  type MilestoneDiff = {
    added: Array<{ name: string; phase: string | null; evidence: unknown[] }>;
    modified: Array<{ existing_id: string; name: string; from_phase: string | null; to_phase: string | null; evidence: unknown[] }>;
    removed: Array<{ existing_id: string; name: string; phase: string | null }>;
  };
  let suggestedMilestoneChanges: MilestoneDiff | null = null;


  try {
    const { data: existingRows } = await sb
      .from("engine_milestones")
      .select("id, name, phase, approval_status")
      .eq("project_id", args.projectId);
    const existing = (existingRows ?? []) as Array<{ id: string; name: string; phase: string | null; approval_status: string | null }>;

    const phases = (parsed.modules?.roadmap as { phases?: Array<{ name: string; milestones: string[] }> } | undefined)?.phases ?? [];
    const milestoneCandidates = insertedSignals.filter((s) => s.category === "milestone_candidate");
    const evidenceForName = (name: string) => {
      const lower = name.toLowerCase();
      const matched = milestoneCandidates
        .filter((c) => lower.includes(c.label.toLowerCase().slice(0, 24)) || c.label.toLowerCase().includes(lower.slice(0, 24)))
        .slice(0, 3)
        .map((c) => ({ signal_id: c.id, source_id: primarySourceId, snippet: c.label, category: c.category }));
      if (matched.length) return matched;
      return srcRows.map((s) => ({ source_id: s.id, snippet: `Derived from ${s.name}` }));
    };

    // Build candidate list (flattened phases).
    const candidates: Array<{ name: string; phase: string | null }> = [];
    for (const phase of phases) {
      for (const name of phase.milestones ?? []) {
        if (!name || typeof name !== "string") continue;
        candidates.push({ name: name.slice(0, 240), phase: phase.name?.slice(0, 120) ?? null });
      }
    }

    if (existing.length === 0) {
      // First run: materialize directly so Builder is populated.
      let sortIndex = 0;
      const msRows = candidates.map((c) => ({
        project_id: args.projectId,
        name: c.name,
        phase: c.phase,
        status: "draft",
        approval_status: "draft",
        sort_index: sortIndex++,
        roadmap_version_id: version.id,
        created_by_kind: "ai",
        source_evidence: evidenceForName(c.name),
      }));
      if (msRows.length) {
        await sb.from("engine_milestones").insert(msRows);
      }
    } else {
      // Re-run: compute a diff and stash suggested changes on the version payload.
      // Do NOT mutate engine_milestones — Tai must approve via version compare.
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const existingByName = new Map(existing.map((e) => [normalize(e.name), e] as const));
      const candidateByName = new Map(candidates.map((c) => [normalize(c.name), c] as const));

      const added: MilestoneDiff["added"] = [];
      const modified: MilestoneDiff["modified"] = [];
      const removed: MilestoneDiff["removed"] = [];

      for (const c of candidates) {
        const key = normalize(c.name);
        const match = existingByName.get(key);
        if (!match) {
          added.push({ name: c.name, phase: c.phase, evidence: evidenceForName(c.name) });
        } else if ((match.phase ?? null) !== (c.phase ?? null)) {
          modified.push({
            existing_id: match.id,
            name: match.name,
            from_phase: match.phase ?? null,
            to_phase: c.phase ?? null,
            evidence: evidenceForName(c.name),
          });
        }
      }
      for (const e of existing) {
        const key = normalize(e.name);
        if (!candidateByName.has(key)) {
          removed.push({ existing_id: e.id, name: e.name, phase: e.phase ?? null });
        }
      }

      suggestedMilestoneChanges = { added, modified, removed };

      // Merge suggested changes into the version payload so the compare/review
      // surface can render them.
      const mergedPayload = {
        ...(parsed.modules ?? {}),
        suggested_milestone_changes: suggestedMilestoneChanges,
      };
      await sb
        .from("engine_roadmap_versions")
        .update({ payload: mergedPayload })
        .eq("id", version.id);
    }
  } catch (e) {
    // Non-fatal: milestone diff is best-effort; the version + review item
    // are already in place so Tai can still act on the draft.
    console.warn("[runIntelligencePipeline] milestone diff failed", e);
  }


  // Update project draft pointer + JSONB modules
  const moduleUpdates: Record<string, any> = {
    roadmap_version: nextVersion,
  };
  // Only surface "draft" when the project was in a transitional state.
  // Terminal / hold statuses (on_hold, blocked, paused, execution, delivered,
  // archived) are preserved; the review item is still the review signal.
  if (canMoveStatus) {
    moduleUpdates.status = "draft";
  }


  // Pillar 5: never overwrite a step whose operator has marked it approved.
  // The pipeline still runs and produces a fresh version + review item, but
  // approved module columns are preserved as-is. Draft/review steps flow
  // through as before.
  const modKeyMap: Record<string, { col: string; stepKey: string }> = {
    extraction: { col: "extraction", stepKey: "extraction" },
    point_a: { col: "point_a", stepKey: "point-a" },
    point_b: { col: "point_b", stepKey: "point-b" },
    hidden_assets: { col: "hidden_assets", stepKey: "hidden-assets" },
    gap_map: { col: "gap_map", stepKey: "gap-map" },
    blueprint: { col: "blueprint", stepKey: "blueprint" },
    roadmap: { col: "roadmap", stepKey: "builder" },
    sequencing: { col: "sequencing", stepKey: "sequencing" },
    deadlines: { col: "deadlines", stepKey: "deadlines" },
    investment: { col: "investment", stepKey: "investment" },
    client_preview: { col: "client_preview", stepKey: "preview" },
  };
  const stepStates = (project.step_states ?? {}) as Record<string, { state?: string } | undefined>;
  const skippedApprovedSteps: string[] = [];
  for (const [k, { col, stepKey }] of Object.entries(modKeyMap)) {
    if (parsed.modules?.[k as keyof typeof parsed.modules]) {
      if (stepStates[stepKey]?.state === "approved") {
        skippedApprovedSteps.push(stepKey);
        continue;
      }
      moduleUpdates[col] = parsed.modules[k as keyof typeof parsed.modules];
    }
  }
  if (skippedApprovedSteps.length) {
    console.info(
      "[runIntelligencePipeline] preserved approved step(s):",
      skippedApprovedSteps.join(", "),
    );
  }
  await sb.from("engine_projects").update(moduleUpdates).eq("id", args.projectId);

  // Change events
  for (const ev of parsed.change_events ?? []) {
    await sb.from("engine_change_events").insert({
      project_id: args.projectId,
      kind: ev.kind,
      title: ev.title,
      body: ev.body ?? null,
      severity: ev.severity ?? "info",
      affected_module: ev.affected_module ?? null,
      version_id: version.id,
    });
  }

  // Mark sources processed + append to used_in_version_ids
  if (srcRows.length) {
    const confidence = parsed.overall_confidence;
    for (const src of srcRows) {
      const existing = (src.used_in_version_ids ?? []) as string[];
      await sb
        .from("engine_sources")
        .update({
          status: "processed",
          confidence,
          used_in_version: nextVersion,
          used_in_version_ids: Array.from(new Set([...existing, version.id])),
          signals_count: signalRows.length,
        })
        .eq("id", src.id);
    }
  }

  // Enqueue review item — G-3: link directly to the version we just produced
  // so decideReviewItem approves this exact draft (no label-based guessing
  // between co-existing pending drafts).
  const diffCounts = suggestedMilestoneChanges
    ? suggestedMilestoneChanges.added.length + suggestedMilestoneChanges.modified.length + suggestedMilestoneChanges.removed.length
    : 0;
  const reviewTitle = diffCounts > 0
    ? `${versionLabel} · ${suggestedMilestoneChanges!.added.length} added / ${suggestedMilestoneChanges!.modified.length} modified / ${suggestedMilestoneChanges!.removed.length} removed milestone(s)`
    : versionLabel;
  await sb.from("engine_review_items").insert({
    project_id: args.projectId,
    project: project.name,
    item_type: "roadmap_version",
    title: reviewTitle,
    impact: "high",
    source: "ai",
    requested_by: "ai",
    status: "pending",
    version_id: version.id,
  });

  // Fan out an in-app operator notification when a re-run produced a
  // milestone diff. Non-blocking; email/review-queue signal is still primary.
  if (diffCounts > 0) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin.from("operator_notifications") as unknown as {
        insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
      }).insert({
        kind: "milestone_review",
        submission_id: null,
        title: `Milestone changes suggested for ${project.name} (${nextVersion})`,
        body: `${suggestedMilestoneChanges!.added.length} added · ${suggestedMilestoneChanges!.modified.length} modified · ${suggestedMilestoneChanges!.removed.length} removed`,
        href: `/engine/projects/${args.projectId}/versions/compare?version=${version.id}`,
        metadata: {
          project_id: args.projectId,
          project_name: project.name,
          version_id: version.id,
          version: nextVersion,
          added: suggestedMilestoneChanges!.added.length,
          modified: suggestedMilestoneChanges!.modified.length,
          removed: suggestedMilestoneChanges!.removed.length,
        },
      });
    } catch (notifErr) {
      console.warn("[runIntelligencePipeline] operator notification insert failed", notifErr);
    }
  }




  // Update project spend + activity
  const { data: proj } = await sb
    .from("engine_projects")
    .select("agent_spend_month_cents")
    .eq("id", args.projectId)
    .single();
  const totalCost = intakeTotalCost + structuredCost;
  await sb
    .from("engine_projects")
    .update({
      agent_spend_month_cents: (proj?.agent_spend_month_cents ?? 0) + totalCost,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", args.projectId);

  // Finalize extraction run
  await sb
    .from("engine_extraction_runs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      signals_count: signalRows.length,
      cost_cents: totalCost,
      produced_version_id: version.id,
      provider_intake: "lovable-gemini",
      provider_structured: parsed.provider,
      model_intake: intakeResults[0]?.model ?? null,
      model_structured: parsed.model,
      intake_summary: intakeResults.map((r) => r.summary).filter(Boolean).join("\n\n").slice(0, 4000),
    })
    .eq("id", runId);

  await sb.from("engine_activity").insert({
    project_id: args.projectId,
    kind: "pipeline_completed",
    title: `Draft ${nextVersion} generated`,
    body: `${signalRows.length} signals extracted · queued for review`,
    severity: "success",
  });

  await logAudit(sb, {
    project_id: args.projectId,
    actor_email: args.actorEmail,
    action: "pipeline_completed",
    summary: `Generated ${nextVersion} from ${srcRows.length} source(s) with ${signalRows.length} signals`,
    version_id: version.id,
    metadata: { run_id: runId, cost_cents: totalCost, provider: parsed.provider, model: parsed.model },
  });

  return { version_id: version.id, version: nextVersion, run_id: runId, signals: signalRows.length };
}

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

// ============================================================
// Intelligence decisions audit ledger — persists merge/clean/reject
// so refreshes preserve the history and RLS-scoped viewers can audit.
// ============================================================
export type IntelligenceDecisionRow = {
  id: string;
  memory_id: string | null;
  project_id: string | null;
  action: "merge" | "clean" | "reject" | "promote" | "archive" | "restore" | "accept";
  actor_email: string;
  before_state: any;
  after_state: any;
  notes: string | null;
  created_at: string;
};

export const listIntelligenceDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      memory_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(raw ?? {}),
  )
  .handler(async ({ context, data }): Promise<IntelligenceDecisionRow[]> => {
    await assertOpsOrAdmin(context);
    const sb = context.supabase as any;
    let q = sb
      .from("engine_intelligence_decisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.memory_id) q = q.eq("memory_id", data.memory_id);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message ?? "list decisions failed");
    return (rows ?? []) as IntelligenceDecisionRow[];
  });

export const recordIntelligenceDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      memory_id: z.string().uuid().nullable().optional(),
      project_id: z.string().uuid().nullable().optional(),
      action: z.enum(["merge", "clean", "reject", "promote", "archive", "restore", "accept"]),
      before_state: z.record(z.string(), z.any()).optional(),
      after_state: z.record(z.string(), z.any()).optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    await assertOpsOrAdmin(context);
    const sb = context.supabase as any;
    const email = ((context as any).claims?.email as string | null) ?? "system";
    const { data: r, error } = await sb
      .from("engine_intelligence_decisions")
      .insert({
        memory_id: data.memory_id ?? null,
        project_id: data.project_id ?? null,
        action: data.action,
        actor_email: email,
        before_state: data.before_state ?? {},
        after_state: data.after_state ?? {},
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message ?? "record decision failed");
    return { ok: true, id: r.id };
  });
