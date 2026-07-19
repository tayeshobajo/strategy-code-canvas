/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified ceremony status reader.
 *
 * Returns the "done"/"pending" state of the five gated ceremonies that
 * drive a project from intake to an approved Roadmap v0.1:
 *
 *   1. World Entry             (sidecar `world_entry_workspace`)
 *   2. Execution Boundary      (sidecar `execution_boundary_workspace`)
 *   3. Strategic Thesis        (sidecar `strategic_thesis_workspace`)
 *   4. Milestone Qualification (sidecar `milestone_qualifications`)
 *   5. Roadmap v0.1            (engine_roadmap_versions.status='approved')
 *
 * The autonomous AI PM can populate drafts for (1)-(3) and seed
 * milestones for (4), but the ceremonies themselves require a human
 * approver. This reader powers the per-project Approvals room and the
 * PM Memory "Ceremonies" checklist tab.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CeremonyKey =
  | "world_entry"
  | "execution_boundary"
  | "strategic_thesis"
  | "milestone_qualification"
  | "roadmap_v01";

export type CeremonyState =
  | "not_started"
  | "drafted"
  | "awaiting_review"
  | "approved"
  | "rejected";

export type CeremonyStatus = {
  key: CeremonyKey;
  label: string;
  state: CeremonyState;
  version: number | null;
  updated_at: string | null;
  updated_by_email: string | null;
  deep_link: string;
  evidence_required: string[];
  blocked_by: CeremonyKey[];
  detail: string | null;
  /** Roadmap version id — only set for the roadmap_v01 ceremony. */
  roadmap_version_id: string | null;
  /** Email of the person who drafted the awaiting-review version (for second-reviewer UI hints). */
  drafted_by_email: string | null;
};

export type ProjectCeremonyStatus = {
  project_id: string;
  ceremonies: CeremonyStatus[];
  completed_count: number;
  total_count: number;
};

const CEREMONY_META: Record<
  CeremonyKey,
  {
    label: string;
    deepLink: (projectId: string) => string;
    evidence: string[];
    blockedBy: CeremonyKey[];
  }
> = {
  world_entry: {
    label: "World Entry",
    deepLink: (id) => `/engine/projects/${id}/world-entry`,
    evidence: [
      "Destination summary approved",
      "Competitor set with positioning",
      "Vocabulary tokens confirmed",
      "At least one evidence source",
    ],
    blockedBy: [],
  },
  execution_boundary: {
    label: "Execution Boundary",
    deepLink: (id) => `/engine/projects/${id}/execution-boundary`,
    evidence: [
      "Selected capabilities from registry",
      "Client-owned areas listed",
      "Exclusions documented",
    ],
    blockedBy: ["world_entry"],
  },
  strategic_thesis: {
    label: "Strategic Thesis",
    deepLink: (id) => `/engine/projects/${id}/strategic-thesis`,
    evidence: [
      "Bet statement + why-now",
      "Proof metrics with targets",
      "Kill criteria set",
      "Linked World Entry + Boundary versions",
    ],
    blockedBy: ["world_entry", "execution_boundary"],
  },
  milestone_qualification: {
    label: "Milestone qualification (≥1)",
    deepLink: (id) => `/engine/projects/${id}/sequencing`,
    evidence: [
      "Milestone brief drafted",
      "World + Wow judges run",
      "Human approver marks qualified",
    ],
    blockedBy: ["strategic_thesis"],
  },
  roadmap_v01: {
    label: "Roadmap v0.1 approved",
    deepLink: (id) => `/engine/projects/${id}/roadmap`,
    evidence: [
      "At least one qualified milestone",
      "Baseline version created",
      "Operator/admin approval",
    ],
    blockedBy: ["milestone_qualification"],
  },
};

function mapSidecarStatus(status: string | undefined): CeremonyState {
  switch (status) {
    case "approved":
      return "approved";
    case "proposed":
    case "awaiting_review":
      return "awaiting_review";
    case "draft":
    case "drafted":
      return "drafted";
    case "superseded":
      return "drafted";
    default:
      return "not_started";
  }
}

async function readSpirit(sb: any, projectId: string): Promise<Record<string, any>> {
  const { data } = await sb
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", projectId)
    .maybeSingle();
  return (data?.spirit_first_analysis ?? {}) as Record<string, any>;
}

export async function computeProjectCeremonyStatus(
  sb: any,
  projectId: string,
): Promise<ProjectCeremonyStatus> {
  const spirit = await readSpirit(sb, projectId);

  const we = spirit.world_entry_workspace ?? {};
  const eb = spirit.execution_boundary_workspace ?? {};
  const st = spirit.strategic_thesis_workspace ?? {};
  const mq = (spirit.milestone_qualifications ?? {}) as Record<string, any>;

  const weCur = we.current ?? null;
  const ebCur = eb.current ?? null;
  const stCur = st.current ?? null;

  // Milestone qualification — at least one 'qualified'
  const qualifiedEntries = Object.entries(mq).filter(
    ([, v]) => (v as any)?.status === "qualified",
  );
  const anyRejected = Object.values(mq).some((v: any) => v?.status === "rejected");
  const anyRun = Object.values(mq).some((v: any) => !!v?.last_run);

  // Roadmap v0.1
  const { data: verRows } = await sb
    .from("engine_roadmap_versions")
    .select("id,label,status,created_at,approved_at,approved_by")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  const versions = (verRows ?? []) as Array<{
    id: string;
    label: string | null;
    status: string;
    created_at: string;
    approved_at: string | null;
    approved_by: string | null;
  }>;
  const firstApproved = versions.find((v) => v.status === "approved");
  const latest = versions[versions.length - 1] ?? null;

  const ceremonies: CeremonyStatus[] = [
    {
      key: "world_entry",
      label: CEREMONY_META.world_entry.label,
      state: mapSidecarStatus(weCur?.status),
      version: (weCur?.version as number | undefined) ?? null,
      updated_at:
        weCur?.approved_at ?? weCur?.submitted_for_review_at ?? weCur?.drafted_at ?? null,
      updated_by_email:
        weCur?.approved_by_email ?? weCur?.drafted_by_email ?? null,
      deep_link: CEREMONY_META.world_entry.deepLink(projectId),
      evidence_required: CEREMONY_META.world_entry.evidence,
      blocked_by: CEREMONY_META.world_entry.blockedBy,
      detail: weCur?.destination_summary?.slice(0, 160) ?? null,
      roadmap_version_id: null,
      drafted_by_email: weCur?.drafted_by_email ?? null,
    },
    {
      key: "execution_boundary",
      label: CEREMONY_META.execution_boundary.label,
      state: mapSidecarStatus(ebCur?.status),
      version: (ebCur?.version as number | undefined) ?? null,
      updated_at: ebCur?.approved_at ?? ebCur?.proposed_at ?? null,
      updated_by_email:
        ebCur?.approved_by_email ?? ebCur?.proposed_by_email ?? null,
      deep_link: CEREMONY_META.execution_boundary.deepLink(projectId),
      evidence_required: CEREMONY_META.execution_boundary.evidence,
      blocked_by: CEREMONY_META.execution_boundary.blockedBy,
      detail: Array.isArray(ebCur?.capability_ids)
        ? `${ebCur.capability_ids.length} capabilities selected`
        : null,
    },
    {
      key: "strategic_thesis",
      label: CEREMONY_META.strategic_thesis.label,
      state: mapSidecarStatus(stCur?.status),
      version: (stCur?.version as number | undefined) ?? null,
      updated_at: stCur?.approved_at ?? stCur?.proposed_at ?? null,
      updated_by_email:
        stCur?.approved_by_email ?? stCur?.proposed_by_email ?? null,
      deep_link: CEREMONY_META.strategic_thesis.deepLink(projectId),
      evidence_required: CEREMONY_META.strategic_thesis.evidence,
      blocked_by: CEREMONY_META.strategic_thesis.blockedBy,
      detail: stCur?.bet_statement?.slice(0, 160) ?? null,
    },
    {
      key: "milestone_qualification",
      label: CEREMONY_META.milestone_qualification.label,
      state:
        qualifiedEntries.length > 0
          ? "approved"
          : anyRejected
            ? "rejected"
            : anyRun
              ? "awaiting_review"
              : Object.keys(mq).length > 0
                ? "drafted"
                : "not_started",
      version: null,
      updated_at: null,
      updated_by_email: null,
      deep_link: CEREMONY_META.milestone_qualification.deepLink(projectId),
      evidence_required: CEREMONY_META.milestone_qualification.evidence,
      blocked_by: CEREMONY_META.milestone_qualification.blockedBy,
      detail:
        qualifiedEntries.length > 0
          ? `${qualifiedEntries.length} milestone(s) qualified`
          : `${Object.keys(mq).length} in progress`,
    },
    {
      key: "roadmap_v01",
      label: CEREMONY_META.roadmap_v01.label,
      state: firstApproved
        ? "approved"
        : latest
          ? latest.status === "proposed"
            ? "awaiting_review"
            : "drafted"
          : "not_started",
      version: null,
      updated_at: firstApproved?.approved_at ?? latest?.created_at ?? null,
      updated_by_email: firstApproved?.approved_by ?? null,
      deep_link: CEREMONY_META.roadmap_v01.deepLink(projectId),
      evidence_required: CEREMONY_META.roadmap_v01.evidence,
      blocked_by: CEREMONY_META.roadmap_v01.blockedBy,
      detail: firstApproved
        ? `Approved as ${firstApproved.label ?? "v0.1"}`
        : latest
          ? `Latest: ${latest.label ?? latest.id.slice(0, 6)} (${latest.status})`
          : null,
    },
  ];

  const completed = ceremonies.filter((c) => c.state === "approved").length;

  return {
    project_id: projectId,
    ceremonies,
    completed_count: completed,
    total_count: ceremonies.length,
  };
}

export const getProjectCeremonyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<ProjectCeremonyStatus> => {
    const sb = (context as any).supabase;
    return computeProjectCeremonyStatus(sb, data.projectId);
  });
