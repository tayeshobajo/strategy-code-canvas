/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-4 — Milestone Qualification Ceremony.
 *
 * Two LLM judges (World fit + Wow fit) grade a milestone against the
 * approved World Entry, Execution Boundary, and Strategic Thesis. A
 * human approver (second-reviewer) then marks the milestone as
 * `qualified` or `rejected` with a note. The ceremony log is
 * append-only.
 *
 * Storage (sidecar until the RT-4 tables in PENDING_MIGRATIONS land):
 *   engine_projects.spirit_first_analysis.milestone_qualifications = {
 *     [milestoneId]: {
 *       status: "unqualified" | "qualified" | "rejected",
 *       decided_by_email?, decided_at?, note?,
 *       last_run?: QualificationRun,
 *       history: QualificationRun[]
 *     }
 *   }
 *
 * Second-Reviewer Rule: the human that authored the milestone brief
 * cannot mark it qualified. `engine_milestones.approved_by_email`
 * counts as authorship for this check.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import { notifyOperators } from "@/lib/engine-work-notify";

/** Marker written into engine_activity.body so we can filter per-milestone. */
export function milestoneMarker(milestoneId: string): string {
  return `[milestone:${milestoneId}]`;
}

const SIDECAR_KEY = "milestone_qualifications";
const MODEL = "google/gemini-3.5-flash";

export type JudgeVerdict = "passes" | "fails" | "unclear";
export type QualificationStatus = "unqualified" | "qualified" | "rejected";

export type WorldJudgeResult = {
  verdict: JudgeVerdict;
  rationale: string;
  cited_world_entry_sections: string[];
};

export type WowJudgeResult = {
  verdict: JudgeVerdict;
  rationale: string;
  wow_score: number; // 1..5
  risks: string[];
};

export type QualificationRun = {
  id: string;
  ran_at: string;
  ran_by_email: string;
  model: string;
  world_judge: WorldJudgeResult;
  wow_judge: WowJudgeResult;
  linked_world_entry_version: number | null;
  linked_execution_boundary_version: number | null;
  linked_strategic_thesis_version: number | null;
};

export type MilestoneQualification = {
  status: QualificationStatus;
  decided_by_email?: string;
  decided_at?: string;
  note?: string;
  last_run?: QualificationRun;
  history: QualificationRun[];
};

// ---------- Zod ----------

const milestoneInput = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});

const decisionInput = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  decision: z.enum(["qualified", "rejected"]),
  note: z.string().trim().max(1000).default(""),
});

const listInput = z.object({ projectId: z.string().uuid() });

// ---------- Helpers ----------

type QualMap = Record<string, MilestoneQualification>;

async function readAll(sb: any, projectId: string): Promise<{
  spirit: Record<string, unknown>;
  map: QualMap;
}> {
  const { data, error } = await sb
    .from("engine_projects")
    .select("spirit_first_analysis")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const spirit = ((data?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  const raw = (spirit[SIDECAR_KEY] as QualMap | undefined) ?? {};
  // Normalize.
  const map: QualMap = {};
  for (const [id, q] of Object.entries(raw)) {
    map[id] = {
      status: (q as any)?.status ?? "unqualified",
      decided_by_email: (q as any)?.decided_by_email,
      decided_at: (q as any)?.decided_at,
      note: (q as any)?.note,
      last_run: (q as any)?.last_run,
      history: Array.isArray((q as any)?.history) ? (q as any).history : [],
    };
  }
  return { spirit, map };
}

async function writeAll(
  sb: any,
  projectId: string,
  spirit: Record<string, unknown>,
  next: QualMap,
): Promise<void> {
  const { error } = await sb
    .from("engine_projects")
    .update({ spirit_first_analysis: { ...spirit, [SIDECAR_KEY]: next } })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

async function loadContext(sb: any, projectId: string, milestoneId: string) {
  const [{ data: proj }, { data: milestone }] = await Promise.all([
    sb
      .from("engine_projects")
      .select("id, name, spirit_first_analysis")
      .eq("id", projectId)
      .maybeSingle(),
    sb
      .from("engine_milestones")
      .select(
        "id, name, phase, brief_md, acceptance_criteria, developer_prompt, related_system_node, related_gap, approval_status, approved_by_email",
      )
      .eq("id", milestoneId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  if (!milestone) throw new Error("Milestone not found.");
  const spirit = ((proj?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;
  const worldEntry = (spirit["world_entry_workspace"] as any)?.current ?? null;
  const boundary = (spirit["execution_boundary_workspace"] as any)?.current ?? null;
  const thesis = (spirit["strategic_thesis_workspace"] as any)?.current ?? null;
  return { proj, milestone, spirit, worldEntry, boundary, thesis };
}

function coerceVerdict(v: unknown): JudgeVerdict {
  return v === "passes" || v === "fails" || v === "unclear" ? v : "unclear";
}

function coerceScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(5, Math.round(x)));
}

// ---------- Judges ----------

async function runWorldJudge(args: {
  milestone: any;
  worldEntry: any;
  thesis: any;
}): Promise<WorldJudgeResult> {
  const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
  const prompt = [
    "MILESTONE:",
    `  name: ${args.milestone.name}`,
    `  phase: ${args.milestone.phase ?? "(none)"}`,
    `  brief: ${(args.milestone.brief_md ?? "").slice(0, 1500)}`,
    "",
    "APPROVED WORLD ENTRY:",
    `  destination: ${args.worldEntry?.destination_summary ?? ""}`,
    `  vocabulary: ${(args.worldEntry?.vocabulary ?? []).join(", ")}`,
    `  competitors: ${(args.worldEntry?.competitors ?? []).map((c: any) => `${c.name}: ${c.positioning}`).join(" | ")}`,
    "",
    "APPROVED STRATEGIC THESIS:",
    `  bet: ${args.thesis?.bet_statement ?? ""}`,
    `  wedge: ${args.thesis?.wedge ?? ""}`,
  ].join("\n");

  const ai = await callLovableAi(
    [
      {
        role: "system",
        content:
          "You are the World Judge. Grade whether a proposed milestone advances the approved destination, uses correct category vocabulary, and does NOT copy competitor positioning. Return STRICT JSON only: {\"verdict\": \"passes|fails|unclear\", \"rationale\": string (2-4 sentences), \"cited_world_entry_sections\": string[]}. Cite the exact World Entry section keys you leaned on (e.g. 'destination_summary', 'vocabulary', 'competitors.<name>').",
      },
      { role: "user", content: prompt },
    ],
    { json: true, temperature: 0.2, model: MODEL },
  );
  const parsed =
    parseJsonOutput<{ verdict: string; rationale: string; cited_world_entry_sections: unknown }>(
      ai.text,
    );
  return {
    verdict: coerceVerdict(parsed?.verdict),
    rationale: (parsed?.rationale ?? "Judge returned no rationale.").toString().slice(0, 2000),
    cited_world_entry_sections: Array.isArray(parsed?.cited_world_entry_sections)
      ? (parsed!.cited_world_entry_sections as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 10)
      : [],
  };
}

async function runWowJudge(args: {
  milestone: any;
  boundary: any;
  thesis: any;
}): Promise<WowJudgeResult> {
  const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
  const prompt = [
    "MILESTONE:",
    `  name: ${args.milestone.name}`,
    `  brief: ${(args.milestone.brief_md ?? "").slice(0, 1500)}`,
    `  acceptance: ${JSON.stringify(args.milestone.acceptance_criteria ?? []).slice(0, 800)}`,
    "",
    "APPROVED EXECUTION BOUNDARY:",
    `  capabilities: ${(args.boundary?.capability_ids ?? []).join(", ")}`,
    `  client-owned: ${(args.boundary?.client_owned_areas ?? []).join(", ")}`,
    `  exclusions: ${(args.boundary?.exclusions ?? []).join(", ")}`,
    "",
    "APPROVED STRATEGIC THESIS PROOF METRICS:",
    (args.thesis?.proof_metrics ?? [])
      .map((p: any) => `  - ${p.metric}: target ${p.target} @ ${p.horizon}`)
      .join("\n"),
  ].join("\n");

  const ai = await callLovableAi(
    [
      {
        role: "system",
        content:
          "You are the Wow Judge. Grade whether this milestone materially moves at least one thesis proof metric, stays inside the execution boundary, and is compelling enough that a client would call it a real result. Return STRICT JSON only: {\"verdict\": \"passes|fails|unclear\", \"rationale\": string (2-4 sentences), \"wow_score\": integer 1-5, \"risks\": string[] (0-4 items)}. Fail if the milestone violates the boundary. Mark unclear if proof metrics are ambiguous.",
      },
      { role: "user", content: prompt },
    ],
    { json: true, temperature: 0.2, model: MODEL },
  );
  const parsed = parseJsonOutput<{
    verdict: string;
    rationale: string;
    wow_score: number;
    risks: unknown;
  }>(ai.text);
  return {
    verdict: coerceVerdict(parsed?.verdict),
    rationale: (parsed?.rationale ?? "Judge returned no rationale.").toString().slice(0, 2000),
    wow_score: coerceScore(parsed?.wow_score),
    risks: Array.isArray(parsed?.risks)
      ? (parsed!.risks as unknown[]).filter((r): r is string => typeof r === "string").slice(0, 6)
      : [],
  };
}

// ---------- Server functions ----------

export const listMilestoneQualifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw))
  .handler(async ({ context, data }): Promise<QualMap> => {
    const ctx = context as unknown as AuthCtx;
    const { map } = await readAll(ctx.supabase as any, data.projectId);
    return map;
  });

export const getMilestoneQualification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => milestoneInput.parse(raw))
  .handler(async ({ context, data }): Promise<MilestoneQualification> => {
    const ctx = context as unknown as AuthCtx;
    const { map } = await readAll(ctx.supabase as any, data.projectId);
    return map[data.milestoneId] ?? { status: "unqualified", history: [] };
  });

export const runMilestoneJudges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => milestoneInput.parse(raw))
  .handler(async ({ context, data }): Promise<MilestoneQualification> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { milestone, spirit, worldEntry, boundary, thesis } = await loadContext(
      sb,
      data.projectId,
      data.milestoneId,
    );
    if (!worldEntry || worldEntry.status !== "approved") {
      throw new Error("World Entry must be approved before qualifying milestones.");
    }
    if (!boundary || boundary.status !== "approved") {
      throw new Error("Execution Boundary must be approved before qualifying milestones.");
    }
    if (!thesis || thesis.status !== "approved") {
      throw new Error("Strategic Thesis must be approved before qualifying milestones.");
    }

    const [world, wow] = await Promise.all([
      runWorldJudge({ milestone, worldEntry, thesis }),
      runWowJudge({ milestone, boundary, thesis }),
    ]);

    const run: QualificationRun = {
      id: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ran_at: new Date().toISOString(),
      ran_by_email: actor,
      model: MODEL,
      world_judge: world,
      wow_judge: wow,
      linked_world_entry_version: worldEntry.version ?? null,
      linked_execution_boundary_version: boundary.version ?? null,
      linked_strategic_thesis_version: thesis.version ?? null,
    };

    const { map } = await readAll(sb, data.projectId);
    const prior: MilestoneQualification = map[data.milestoneId] ?? { status: "unqualified", history: [] };
    // Running the judges after a decision resets the status to
    // unqualified — a new run means the human must review again.
    const next: MilestoneQualification = {
      status: prior.status === "qualified" ? "unqualified" : prior.status,
      decided_by_email: undefined,
      decided_at: undefined,
      note: undefined,
      last_run: run,
      history: [run, ...prior.history].slice(0, 20),
    };
    const nextMap: QualMap = { ...map, [data.milestoneId]: next };
    await writeAll(sb, data.projectId, spirit, nextMap);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "milestone_qualification.judges_ran",
      title: `Milestone judges ran — ${milestone.name}`,
      body: `World: ${world.verdict} · Wow: ${wow.verdict} (${wow.wow_score}/5)`,
      severity: "info",
      actor_email: actor,
    });

    return next;
  });

export const decideMilestoneQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => decisionInput.parse(raw))
  .handler(async ({ context, data }): Promise<MilestoneQualification> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { milestone, spirit } = await loadContext(sb, data.projectId, data.milestoneId);

    // Second-reviewer: whoever approved the brief cannot qualify it.
    const author = (milestone.approved_by_email ?? "").toLowerCase();
    if (author && author === actor.toLowerCase() && data.decision === "qualified") {
      throw new Error(
        "Second-reviewer rule: the person who approved this milestone brief cannot qualify it. Ask another admin or operator.",
      );
    }

    const { map } = await readAll(sb, data.projectId);
    const prior: MilestoneQualification = map[data.milestoneId] ?? { status: "unqualified", history: [] };
    if (!prior.last_run && data.decision === "qualified") {
      throw new Error("Run the World and Wow judges before marking a milestone qualified.");
    }

    const next: MilestoneQualification = {
      ...prior,
      status: data.decision,
      decided_by_email: actor,
      decided_at: new Date().toISOString(),
      note: data.note,
    };
    const nextMap: QualMap = { ...map, [data.milestoneId]: next };
    await writeAll(sb, data.projectId, spirit, nextMap);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: data.decision === "qualified"
        ? "milestone_qualification.qualified"
        : "milestone_qualification.rejected",
      title: `Milestone ${data.decision} — ${milestone.name}`,
      body: data.note || undefined,
      severity: data.decision === "qualified" ? "success" : "warn",
      actor_email: actor,
    });

    return next;
  });
