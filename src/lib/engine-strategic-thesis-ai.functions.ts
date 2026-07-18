/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-4 — AI drafter for the Strategic Thesis.
 *
 * Reads the approved World Entry + Execution Boundary + intake summary,
 * then asks the LLM for a testable bet, proof metrics, kill criteria,
 * and assumptions. Writes as `draft` status, attributed to actor="ai".
 * Never auto-approves. Falls back to a deterministic scaffold when the
 * LLM output can't be parsed so operators always have something to edit.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import type {
  StrategicThesisState,
  StrategicThesisVersion,
  ProofMetric,
  KillCriterion,
  ThesisAssumption,
} from "@/lib/engine-strategic-thesis.functions";

const SIDECAR_KEY = "strategic_thesis_workspace";
const MODEL = "google/gemini-3.5-flash";
const input = z.object({ projectId: z.string().uuid() });

type DrafterOutput = {
  bet_statement?: string;
  why_now?: string;
  wedge?: string;
  proof_metrics?: Array<{ metric?: string; target?: string; horizon?: string }>;
  kill_criteria?: Array<{ statement?: string }>;
  assumptions?: Array<{ statement?: string; confidence?: "low" | "medium" | "high" }>;
  notes?: string;
};

function shortId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export const aiDraftStrategicThesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ context, data }): Promise<StrategicThesisState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    const { data: proj, error: readErr } = await sb
      .from("engine_projects")
      .select("id, name, spirit_first_analysis, intake_summary")
      .eq("id", data.projectId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const spirit = ((proj?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const worldEntry = (spirit["world_entry_workspace"] as any)?.current ?? null;
    const boundary = (spirit["execution_boundary_workspace"] as any)?.current ?? null;

    if (!worldEntry || worldEntry.status !== "approved") {
      throw new Error("World Entry must be approved before drafting the Strategic Thesis.");
    }
    if (!boundary || boundary.status !== "approved") {
      throw new Error("Execution Boundary must be approved before drafting the Strategic Thesis.");
    }

    const context_block = [
      `PROJECT: ${proj.name ?? "(unnamed)"}`,
      "",
      "APPROVED WORLD ENTRY:",
      `  destination: ${worldEntry.destination_summary ?? ""}`,
      `  vocabulary: ${(worldEntry.vocabulary ?? []).slice(0, 12).join(", ")}`,
      `  competitors: ${(worldEntry.competitors ?? []).map((c: any) => `${c.name} — ${c.positioning}`).slice(0, 6).join(" | ")}`,
      "",
      "APPROVED EXECUTION BOUNDARY:",
      `  capabilities: ${(boundary.capability_ids ?? []).join(", ")}`,
      `  client-owned: ${(boundary.client_owned_areas ?? []).join(", ")}`,
      `  exclusions: ${(boundary.exclusions ?? []).join(", ")}`,
      "",
      "INTAKE SUMMARY:",
      (proj?.intake_summary ?? "").toString().slice(0, 4000),
    ].join("\n");

    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    let parsed: DrafterOutput | null = null;
    try {
      const ai = await callLovableAi(
        [
          {
            role: "system",
            content:
              "You are a Strategic Thesis analyst. Given approved World Entry and Execution Boundary, draft a testable strategic bet. Return STRICT JSON with keys: bet_statement (1 sentence, opinionated), why_now (2-3 sentences on timing), wedge (the specific entry wedge — a niche, format, or capability that unlocks the destination), proof_metrics (3-5 items with metric+target+horizon), kill_criteria (2-3 items — what would prove us wrong), assumptions (3-6 items with confidence low/medium/high), notes (short). Ground every claim in the provided material. Never invent capabilities outside the boundary.",
          },
          { role: "user", content: `${context_block}\n\nReturn JSON only.` },
        ],
        { json: true, temperature: 0.4, model: MODEL },
      );
      parsed = parseJsonOutput<DrafterOutput>(ai.text);
    } catch (e) {
      console.warn("[strategic-thesis] AI call failed, using scaffold", (e as Error).message);
    }

    const scaffold: DrafterOutput = {
      bet_statement:
        parsed?.bet_statement ??
        `We will win the ${(worldEntry.destination_summary ?? "target category").slice(0, 80)} category by leading with the approved wedge.`,
      why_now:
        parsed?.why_now ??
        "Category vocabulary is unsettled and competitor positioning leaves an obvious gap. We can plant the flag before it hardens.",
      wedge: parsed?.wedge ?? "Own the destination language through the highest-leverage approved capability.",
      proof_metrics:
        parsed?.proof_metrics && parsed.proof_metrics.length > 0
          ? parsed.proof_metrics
          : [
              { metric: "Category vocabulary rank", target: "Top 3 for 5 key terms", horizon: "90 days" },
              { metric: "Qualified inbound", target: "12 per month", horizon: "6 months" },
            ],
      kill_criteria:
        parsed?.kill_criteria && parsed.kill_criteria.length > 0
          ? parsed.kill_criteria
          : [
              { statement: "No movement on the vocabulary rank after two full content cycles." },
              { statement: "Every proof metric misses target by more than 50% at the horizon." },
            ],
      assumptions:
        parsed?.assumptions && parsed.assumptions.length > 0
          ? parsed.assumptions
          : [
              { statement: "The destination remains a real category, not a marketing frame.", confidence: "medium" },
              { statement: "Client can sustain the approved delivery cadence.", confidence: "medium" },
            ],
      notes: parsed?.notes ?? "AI-drafted from approved World Entry + Execution Boundary. Review before proposing.",
    };

    const proof_metrics: ProofMetric[] = (scaffold.proof_metrics ?? []).slice(0, 10).map((p) => ({
      id: shortId("pm"),
      metric: (p.metric ?? "").trim().slice(0, 200) || "Metric",
      target: (p.target ?? "").trim().slice(0, 200) || "Target",
      horizon: (p.horizon ?? "").trim().slice(0, 120) || "90 days",
    }));
    const kill_criteria: KillCriterion[] = (scaffold.kill_criteria ?? []).slice(0, 10).map((k) => ({
      id: shortId("kc"),
      statement: (k.statement ?? "").trim().slice(0, 400) || "Kill criterion",
    }));
    const assumptions: ThesisAssumption[] = (scaffold.assumptions ?? []).slice(0, 15).map((a) => ({
      id: shortId("as"),
      statement: (a.statement ?? "").trim().slice(0, 400) || "Assumption",
      confidence: a.confidence === "low" || a.confidence === "high" ? a.confidence : "medium",
    }));

    // Persist as a draft.
    const priorState = (spirit[SIDECAR_KEY] as StrategicThesisState | undefined) ?? {
      current: null,
      history: [],
    };
    const now = new Date().toISOString();
    const currentIsApproved = priorState.current?.status === "approved";
    const nextHistory = currentIsApproved && priorState.current
      ? [...priorState.history, { ...priorState.current, status: "superseded" as const }]
      : priorState.history;
    const nextVersion = [
      ...nextHistory,
      ...(priorState.current && !currentIsApproved ? [priorState.current] : []),
    ].reduce((m, v) => Math.max(m, v.version), 0) + 1;

    const draft: StrategicThesisVersion = {
      version: nextVersion,
      status: "draft",
      bet_statement: (scaffold.bet_statement ?? "").slice(0, 1000),
      why_now: (scaffold.why_now ?? "").slice(0, 1500),
      wedge: (scaffold.wedge ?? "").slice(0, 1000),
      proof_metrics,
      kill_criteria,
      assumptions,
      linked_world_entry_version: worldEntry.version ?? null,
      linked_execution_boundary_version: boundary.version ?? null,
      notes: (scaffold.notes ?? "").slice(0, 2000),
      proposed_by_email: actor,
      proposed_by_actor: "ai",
      proposed_at: now,
    };

    const nextState: StrategicThesisState = { current: draft, history: nextHistory };
    const { error: upErr } = await sb
      .from("engine_projects")
      .update({ spirit_first_analysis: { ...spirit, [SIDECAR_KEY]: nextState } })
      .eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "strategic_thesis.ai_drafted",
      title: `Strategic Thesis v${nextVersion} AI-drafted`,
      body: `Drafted by ${actor} from approved World Entry v${worldEntry.version} + Execution Boundary v${boundary.version}.`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });
