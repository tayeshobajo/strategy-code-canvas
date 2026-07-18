/**
 * Phase RT-5 — Materiality scan runner.
 *
 * Runs during `refresh` mode BEFORE the legacy fill. For every source
 * updated since the last synthesis attempt, classifies impact via the
 * LLM classifier (with rules fallback). When a material change targets
 * a spine that already has approved truth, writes an amendment
 * candidate instead of mutating anything. Non-material and empty-spine
 * cases fall through to the normal fill.
 */

import { classifySourceChangeSmart } from "../materiality-llm";
import type { SourceChangeImpact } from "../contract";

type Sb = any;

export type MaterialityScanResult = {
  scanned: number;
  amendmentsWritten: number;
  duplicatesSkipped: number;
  errors: string[];
};

const IMPACT_TO_SPINES: Partial<Record<SourceChangeImpact, string[]>> = {
  material_point_a: ["point-a", "gaps", "assets", "constraints"],
  material_point_b: ["point-b"],
  material_scope: ["execution-boundary", "world-entry", "strategic-thesis"],
  material_sequence: ["sequencing", "phase-rationale"],
  contradictory: [
    "point-a",
    "point-b",
    "world-entry",
    "execution-boundary",
    "strategic-thesis",
  ],
};

export async function runMaterialityScan(args: {
  projectId: string;
  supabase: Sb;
  actorEmail: string | null;
}): Promise<MaterialityScanResult> {
  const { supabase, projectId } = args;
  const result: MaterialityScanResult = { scanned: 0, amendmentsWritten: 0, errors: [] };

  const lastAttemptRes = await supabase
    .from("engine_project_synthesis_attempts")
    .select("started_at")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since = (lastAttemptRes.data?.started_at as string | undefined) ?? null;

  let q = supabase
    .from("engine_sources")
    .select("id, name, type, raw_text, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (since) q = q.gt("updated_at", since);
  const { data: freshSources, error: freshErr } = await q;
  if (freshErr) {
    result.errors.push(freshErr.message ?? "load fresh sources failed");
    return result;
  }
  if (!freshSources || freshSources.length === 0) return result;

  const [{ data: allSources }, { data: contradictions }, { data: projectRow }] = await Promise.all([
    supabase
      .from("engine_sources")
      .select("id, name, type, raw_text, updated_at")
      .eq("project_id", projectId)
      .limit(200),
    supabase
      .from("engine_extracted_signals")
      .select("id")
      .eq("project_id", projectId)
      .eq("category", "contradiction")
      .limit(50),
    supabase
      .from("engine_projects")
      .select("name, client_name")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  const contradictionIds = ((contradictions as Array<{ id: string }>) ?? []).map((r) => r.id);
  const projectContext = projectRow
    ? `${(projectRow as { name?: string }).name ?? ""} — client: ${(projectRow as { client_name?: string }).client_name ?? ""}`
    : "";

  // Load all approved truth rows once, index by spine.
  const { data: approvedTruth } = await supabase
    .from("engine_spine_field_truth")
    .select("id, spine, field_key, status, source_ref")
    .eq("project_id", projectId)
    .in("status", ["approved", "assumed"]);
  const approvedBySpine = new Map<string, Array<{ id: string; field_key: string; source_ref: unknown }>>();
  for (const t of (approvedTruth as Array<{ id: string; spine: string; field_key: string; source_ref: unknown; status: string }>) ?? []) {
    if (t.status !== "approved") continue;
    const arr = approvedBySpine.get(t.spine) ?? [];
    arr.push({ id: t.id, field_key: t.field_key, source_ref: t.source_ref });
    approvedBySpine.set(t.spine, arr);
  }

  const priorForClassify = ((allSources as Array<{ id: string; name: string | null; type: string | null; raw_text: string | null; updated_at?: string | null }>) ?? []).map(
    (s) => ({ id: s.id, name: s.name, type: s.type, raw_text: s.raw_text, updated_at: s.updated_at ?? null }),
  );

  for (const src of freshSources as Array<{ id: string; name: string | null; type: string | null; raw_text: string | null; updated_at: string | null }>) {
    result.scanned += 1;
    try {
      const decision = await classifySourceChangeSmart({
        source: {
          id: src.id,
          name: src.name,
          type: src.type,
          raw_text: src.raw_text,
          updated_at: src.updated_at,
        },
        existing_sources: priorForClassify.filter((p) => p.id !== src.id),
        contradiction_signal_ids: contradictionIds,
        projectContext,
      });

      const targetSpines =
        decision.affected_spines.length > 0
          ? decision.affected_spines
          : IMPACT_TO_SPINES[decision.impact] ?? [];
      if (targetSpines.length === 0) continue;

      for (const spine of targetSpines) {
        const approvedRows = approvedBySpine.get(spine);
        if (!approvedRows || approvedRows.length === 0) continue;

        for (const row of approvedRows) {
          // Skip if we've already written a pending amendment for this
          // (source, truth) pair to avoid duplicates on repeated refreshes.
          const dupRes = await supabase
            .from("engine_project_synthesis_candidates")
            .select("id")
            .eq("project_id", projectId)
            .eq("step_id", "roadmap_amendment")
            .eq("status", "pending")
            .contains("payload", { target: { truthId: row.id }, sourceIds: [src.id] })
            .limit(1);
          if ((dupRes.data as Array<{ id: string }> | null)?.length) continue;

          const payload = {
            kind: "roadmap_amendment" as const,
            target: { kind: "truth" as const, truthId: row.id, spine, fieldKey: row.field_key },
            before: (row.source_ref as unknown) ?? null,
            after: { source_ids: [src.id] },
            rationale: `New intelligence from source "${src.name ?? "untitled"}" (${decision.impact}). ${decision.rationale}`,
            impact: decision.impact,
            confidence: decision.confidence,
            sourceIds: [src.id],
            signalIds: [],
            actorEmail: args.actorEmail,
            createdAt: new Date().toISOString(),
          };

          const { error: insErr } = await supabase
            .from("engine_project_synthesis_candidates")
            .insert({
              project_id: projectId,
              step_id: "roadmap_amendment",
              payload,
              materiality: decision.impact,
              status: "pending",
            });
          if (insErr) {
            result.errors.push(insErr.message ?? "amendment insert failed");
            continue;
          }
          result.amendmentsWritten += 1;
        }
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : "classify failed");
    }
  }

  if (result.amendmentsWritten > 0) {
    try {
      const { notifyOperators } = await import("@/lib/engine-work-notify");
      await notifyOperators(supabase, {
        projectId,
        kind: "roadmap.amendment.batch",
        title: `${result.amendmentsWritten} amendment${result.amendmentsWritten === 1 ? "" : "s"} awaiting review`,
        body: `Materiality scan flagged approved truth affected by new intelligence.`,
        href: `/engine/projects/${projectId}/amendments`,
      });
    } catch {
      /* best-effort */
    }
  }

  return result;
}
