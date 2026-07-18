/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RT-6 — Detectors compose queries against the authenticated Supabase client.
 * Each detector returns an array of upsertable signal rows (without id).
 */
import { judgeDrift } from "./judges";

type Sb = { from: (t: string) => any };

export type DraftSignal = {
  project_id: string;
  milestone_id: string | null;
  source_kind: "task" | "evidence" | "delivery" | "publish" | "milestone";
  source_id: string;
  anchor_kind: "thesis" | "rationale" | "boundary" | "capability" | "delivery_scope";
  severity: "low" | "medium" | "high";
  classification:
    | "drift"
    | "out_of_scope"
    | "contradicts"
    | "missing_capability"
    | "unmapped";
  summary: string;
  suggested_action: string | null;
  rationale_json: Record<string, unknown>;
  created_by_kind: "ai" | "detector";
  created_by_email: string | null;
  model: string | null;
  detector_version: string;
};

const DETECTOR_VERSION = "rt6.v1";

async function fetchApprovedBoundary(sb: Sb, projectId: string) {
  const { data } = await sb
    .from("engine_project_execution_boundary")
    .select("version, capability_ids, exclusions, client_owned_areas, notes")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    version: number;
    capability_ids: string[];
    exclusions: string[];
    client_owned_areas: string[];
    notes: string;
  } | null;
}

async function fetchApprovedThesisText(sb: Sb, projectId: string): Promise<string | null> {
  // Thesis + world entry live inside engine_projects.spirit JSON per existing code.
  const { data } = await sb
    .from("engine_projects")
    .select("spirit")
    .eq("id", projectId)
    .maybeSingle();
  const spirit = (data as any)?.spirit ?? null;
  if (!spirit) return null;
  const parts: string[] = [];
  const world = spirit.world_entry_workspace?.current;
  if (world) {
    parts.push(`World entry: ${world.world_entry ?? ""}`);
    parts.push(`Wow: ${world.wow_moment ?? world.wow ?? ""}`);
    if (Array.isArray(world.vocabulary)) parts.push(`Vocabulary: ${world.vocabulary.join(", ")}`);
    if (world.destination) parts.push(`Destination: ${world.destination}`);
  }
  const thesis = spirit.strategic_thesis?.current;
  if (thesis) {
    parts.push(`Strategic thesis: ${thesis.narrative ?? thesis.summary ?? ""}`);
  }
  const text = parts.filter(Boolean).join("\n").trim();
  return text.length > 0 ? text : null;
}

async function fetchApprovedMilestones(sb: Sb, projectId: string) {
  const { data } = await sb
    .from("engine_milestones")
    .select("id, name, brief_md, acceptance_criteria, approval_status, related_gap, related_system_node")
    .eq("project_id", projectId)
    .eq("approval_status", "approved");
  return ((data as any[]) ?? []) as Array<{
    id: string;
    name: string;
    brief_md: string | null;
    acceptance_criteria: unknown;
    related_gap: string | null;
    related_system_node: string | null;
  }>;
}

/**
 * Boundary drift — capability strings on tasks (via `source` or `phase`) or
 * milestone `related_system_node` that don't appear in the approved boundary.
 * Pure SQL diff; no LLM needed.
 */
export async function detectBoundaryDrift(
  sb: Sb,
  projectId: string,
  actor: string | null,
): Promise<DraftSignal[]> {
  const boundary = await fetchApprovedBoundary(sb, projectId);
  if (!boundary) return [];
  const approved = new Set((boundary.capability_ids ?? []).map((c) => c.toLowerCase()));
  const exclusions = new Set((boundary.exclusions ?? []).map((c) => c.toLowerCase()));

  const { data: tasks } = await sb
    .from("engine_tasks")
    .select("id, milestone_id, name, description, phase, source")
    .eq("project_id", projectId)
    .limit(500);

  const signals: DraftSignal[] = [];
  for (const t of ((tasks as any[]) ?? [])) {
    const candidates = [t.phase, t.source].filter(Boolean).map((s: string) => s.toLowerCase());
    for (const cap of candidates) {
      if (exclusions.has(cap)) {
        signals.push({
          project_id: projectId,
          milestone_id: t.milestone_id ?? null,
          source_kind: "task",
          source_id: t.id,
          anchor_kind: "boundary",
          severity: "high",
          classification: "out_of_scope",
          summary: `Task "${t.name}" uses capability "${cap}" that is on the boundary exclusion list.`,
          suggested_action: "Reassign the task, remove the capability tag, or amend the boundary.",
          rationale_json: { capability: cap, boundary_version: boundary.version, reason: "exclusion" },
          created_by_kind: "detector",
          created_by_email: actor,
          model: null,
          detector_version: DETECTOR_VERSION,
        });
      } else if (approved.size > 0 && !approved.has(cap)) {
        signals.push({
          project_id: projectId,
          milestone_id: t.milestone_id ?? null,
          source_kind: "task",
          source_id: t.id,
          anchor_kind: "capability",
          severity: "medium",
          classification: "missing_capability",
          summary: `Task "${t.name}" uses capability "${cap}" not in the approved boundary v${boundary.version}.`,
          suggested_action: "Add the capability to the boundary via an amendment, or update the task.",
          rationale_json: { capability: cap, boundary_version: boundary.version, approved: [...approved] },
          created_by_kind: "detector",
          created_by_email: actor,
          model: null,
          detector_version: DETECTOR_VERSION,
        });
      }
    }
  }
  return signals;
}

/**
 * Rationale drift — for each approved milestone, sample its unmapped tasks
 * and ask the LLM whether they serve the milestone brief / acceptance criteria.
 */
export async function detectRationaleDrift(
  sb: Sb,
  projectId: string,
  actor: string | null,
  opts: { maxJudgments?: number } = {},
): Promise<DraftSignal[]> {
  const cap = opts.maxJudgments ?? 12;
  const milestones = await fetchApprovedMilestones(sb, projectId);
  if (milestones.length === 0) return [];
  const { data: tasks } = await sb
    .from("engine_tasks")
    .select("id, milestone_id, name, description, status")
    .eq("project_id", projectId)
    .in("status", ["in_progress", "done", "verified", "accepted"])
    .limit(400);

  const rows = (tasks as any[]) ?? [];
  const byMs = new Map<string, typeof milestones[number]>();
  for (const m of milestones) byMs.set(m.id, m);

  const signals: DraftSignal[] = [];
  let judged = 0;
  for (const t of rows) {
    if (judged >= cap) break;
    const ms = byMs.get(t.milestone_id);
    if (!ms) continue;
    const anchor = [
      `Milestone: ${ms.name}`,
      ms.brief_md ? `Brief:\n${ms.brief_md}` : "",
      Array.isArray(ms.acceptance_criteria) && ms.acceptance_criteria.length > 0
        ? `Acceptance:\n- ${(ms.acceptance_criteria as string[]).join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const work = `Task: ${t.name}\n${t.description ?? ""}`;
    judged += 1;
    const verdict = await judgeDrift({
      anchorKind: "rationale",
      anchorText: anchor,
      workKind: "task",
      workText: work,
    });
    if (verdict && verdict.drift) {
      signals.push({
        project_id: projectId,
        milestone_id: ms.id,
        source_kind: "task",
        source_id: t.id,
        anchor_kind: "rationale",
        severity: verdict.severity,
        classification: verdict.classification,
        summary: verdict.summary || `Task "${t.name}" may not serve milestone "${ms.name}".`,
        suggested_action: verdict.suggested_action || "Re-scope the task or move it to a different milestone.",
        rationale_json: { verdict },
        created_by_kind: "ai",
        created_by_email: actor,
        model: "google/gemini-3-flash-preview",
        detector_version: DETECTOR_VERSION,
      });
    }
  }
  return signals;
}

/**
 * Thesis drift — reviews accepted evidence records against the world-entry
 * and strategic-thesis text. Flags contradictions or off-world claims.
 */
export async function detectThesisDrift(
  sb: Sb,
  projectId: string,
  actor: string | null,
  opts: { maxJudgments?: number } = {},
): Promise<DraftSignal[]> {
  const anchor = await fetchApprovedThesisText(sb, projectId);
  if (!anchor) return [];
  const cap = opts.maxJudgments ?? 10;
  const { data: evidence } = await sb
    .from("engine_work_evidence")
    .select("id, milestone_id, task_id, title, summary, evidence_type, verdict")
    .eq("project_id", projectId)
    .eq("verdict", "accepted")
    .order("created_at", { ascending: false })
    .limit(cap);

  const signals: DraftSignal[] = [];
  for (const e of ((evidence as any[]) ?? [])) {
    const work = `Evidence (${e.evidence_type}): ${e.title}\n${e.summary ?? ""}`;
    const verdict = await judgeDrift({
      anchorKind: "thesis",
      anchorText: anchor,
      workKind: "evidence",
      workText: work,
    });
    if (verdict && verdict.drift) {
      signals.push({
        project_id: projectId,
        milestone_id: e.milestone_id ?? null,
        source_kind: "evidence",
        source_id: e.id,
        anchor_kind: "thesis",
        severity: verdict.severity,
        classification: verdict.classification,
        summary: verdict.summary || `Evidence "${e.title}" may contradict approved thesis.`,
        suggested_action: verdict.suggested_action || "Review the evidence with the reviewer who accepted it.",
        rationale_json: { verdict },
        created_by_kind: "ai",
        created_by_email: actor,
        model: "google/gemini-3-flash-preview",
        detector_version: DETECTOR_VERSION,
      });
    }
  }
  return signals;
}

/**
 * Delivery drift — delivery items whose roadmap version is behind the
 * project's current approved roadmap version, or whose scope text mentions
 * milestones that are not in the current version.
 */
export async function detectDeliveryDrift(
  sb: Sb,
  projectId: string,
  actor: string | null,
): Promise<DraftSignal[]> {
  const { data: approvedVersion } = await sb
    .from("engine_roadmap_versions")
    .select("id, version_number")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!approvedVersion) return [];

  const { data: deliveries } = await sb
    .from("engine_delivery_items")
    .select("id, roadmap, version, status, prepared_by")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  const signals: DraftSignal[] = [];
  const currentLabel = `v${(approvedVersion as any).version_number}`;
  for (const d of ((deliveries as any[]) ?? [])) {
    if (d.status !== "sent" && d.status !== "delivered" && d.status !== "acknowledged") continue;
    const v = String(d.version ?? "").toLowerCase();
    if (v && !v.includes(String((approvedVersion as any).version_number))) {
      signals.push({
        project_id: projectId,
        milestone_id: null,
        source_kind: "delivery",
        source_id: d.id,
        anchor_kind: "delivery_scope",
        severity: "medium",
        classification: "out_of_scope",
        summary: `Delivery "${d.roadmap}" was sent as ${d.version} but current approved roadmap is ${currentLabel}.`,
        suggested_action: "Send an updated roadmap or note the version drift to the client.",
        rationale_json: { delivered_version: d.version, current_version: currentLabel },
        created_by_kind: "detector",
        created_by_email: actor,
        model: null,
        detector_version: DETECTOR_VERSION,
      });
    }
  }
  return signals;
}
