/* eslint-disable @typescript-eslint/no-explicit-any */
// Sprint 1 · Wave 1 — Source & Truth Inspector server function.
// Auth-gated. Reads existing tables only — no schema migration.
// Returns the evidence trail behind any approved Spine statement so the
// operator can move Spine claim → source excerpt in ≤ 2 clicks.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = any;

export type SourceExcerpt = {
  id: string;
  source_kind: string;
  source_title: string | null;
  excerpt: string;
  captured_at: string | null;
  confidence: number | null;
};

export type InspectionAudit = {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  summary: string | null;
};

export type SourceInspectionPayload = {
  statement: string | null;
  status:
    | "draft"
    | "inferred"
    | "needs_confirmation"
    | "contradictory"
    | "accepted_assumption"
    | "verified"
    | "approved_truth"
    | "superseded"
    | "unknown";
  confidence: number | null;
  source_count: number;
  excerpts: SourceExcerpt[];
  captain_interpretation: string | null;
  assumptions: string[];
  contradictions: string[];
  updated_by: string | null;
  updated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  version: number | null;
  related_roadmap_items: Array<{ id: string; label: string }>;
  audit: InspectionAudit[];
  deep_link: string | null;
};

export const getSourceInspection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        sectionKey: z.string().min(1),
        fieldKey: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;

    // Best-effort read of the project row for the approved statement.
    const { data: projectRow } = await supabase
      .from("engine_projects")
      .select(
        "id,name,status,point_a,point_b,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,updated_at",
      )
      .eq("id", data.projectId)
      .maybeSingle();

    const bag = (projectRow ?? {}) as Record<string, unknown>;
    const record = (bag[data.sectionKey] ?? null) as Record<string, unknown> | null;
    const statement = extractStatement(record, data.fieldKey);

    // Sources visible for this project. RLS ensures the caller is authorised.
    const { data: sourceRows } = await supabase
      .from("engine_sources")
      .select("id,kind,title,summary,confidence,created_at,processed_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(6);

    const excerpts: SourceExcerpt[] = (sourceRows ?? []).map((r: any) => ({
      id: String(r.id),
      source_kind: String(r.kind ?? "source"),
      source_title: (r.title as string | null) ?? null,
      excerpt: (r.summary as string | null) ?? "No summary captured yet.",
      captured_at: (r.processed_at ?? r.created_at ?? null) as string | null,
      confidence: (r.confidence as number | null) ?? null,
    }));

    // Related activity / audit rows for provenance & who-touched-what.
    const { data: activityRows } = await supabase
      .from("engine_activity")
      .select("id,kind,title,body,actor_email,severity,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(8);

    const audit: InspectionAudit[] = (activityRows ?? []).map((a: any) => ({
      id: String(a.id),
      action: String(a.kind ?? "event"),
      actor_email: (a.actor_email as string | null) ?? null,
      created_at: String(a.created_at),
      summary: (a.title as string | null) ?? (a.body as string | null) ?? null,
    }));

    const payload: SourceInspectionPayload = {
      statement,
      status: deriveFieldStatus(record, statement),
      confidence: averageConfidence(excerpts),
      source_count: excerpts.length,
      excerpts,
      captain_interpretation: pickString(record, ["captain_interpretation", "summary", "narrative"]),
      assumptions: pickStringArray(record, ["assumptions", "accepted_assumptions"]),
      contradictions: pickStringArray(record, ["contradictions", "conflicts"]),
      updated_by: pickString(bag, ["updated_by"]),
      updated_at: (bag.updated_at as string | null) ?? null,
      approved_by: pickString(record, ["approved_by"]),
      approved_at: pickString(record, ["approved_at"]),
      version: (record?.version as number | null) ?? null,
      related_roadmap_items: extractRelated(bag),
      audit,
      deep_link: deepLinkFor(data.sectionKey, data.projectId),
    };

    return { inspection: payload };
  });

function extractStatement(
  record: Record<string, unknown> | null,
  fieldKey: string,
): string | null {
  if (!record) return null;
  const direct = record[fieldKey];
  if (typeof direct === "string" && direct.trim().length) return direct;
  const summary = record.summary ?? record.statement ?? record.description;
  if (typeof summary === "string" && summary.trim().length) return summary;
  return null;
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length) return v;
  }
  return null;
}

function pickStringArray(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string[] {
  if (!obj) return [];
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim().length) as string[];
  }
  return [];
}

function deriveFieldStatus(
  record: Record<string, unknown> | null,
  statement: string | null,
): SourceInspectionPayload["status"] {
  if (!record) return "draft";
  const status = record.status ?? record.truth_status;
  if (typeof status === "string") return status as SourceInspectionPayload["status"];
  if (record.approved_at) return "approved_truth";
  if (statement) return "inferred";
  return "unknown";
}

function averageConfidence(excerpts: SourceExcerpt[]): number | null {
  const vals = excerpts.map((e) => e.confidence).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function extractRelated(bag: Record<string, unknown>): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const roadmap = bag.roadmap as Record<string, unknown> | null | undefined;
  const phases = roadmap?.phases;
  if (Array.isArray(phases)) {
    for (const p of phases.slice(0, 4)) {
      if (p && typeof p === "object") {
        const rec = p as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : null;
        const label =
          typeof rec.name === "string"
            ? rec.name
            : typeof rec.title === "string"
              ? rec.title
              : null;
        if (id && label) out.push({ id, label });
      }
    }
  }
  return out;
}

function deepLinkFor(sectionKey: string, projectId: string): string {
  const map: Record<string, string> = {
    point_a: "point-a",
    point_b: "point-b",
    hidden_assets: "hidden-assets",
    gap_map: "gap-map",
    blueprint: "blueprint",
    roadmap: "builder",
    sequencing: "sequencing",
    deadlines: "deadlines",
    investment: "investment",
  };
  const suffix = map[sectionKey] ?? sectionKey;
  return `/engine/projects/${projectId}/${suffix}`;
}
