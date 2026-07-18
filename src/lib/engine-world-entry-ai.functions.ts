/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-2 — AI drafter for the World Entry workspace.
 *
 * Reads intake/source material and drafts a destination summary,
 * competitor review, and category vocabulary. Writes the draft into
 * the same sidecar bucket used by `engine-world-entry.functions.ts`
 * with status `drafted` and `drafted_by_actor = "ai"`. Never approves.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import type {
  WorldEntryState,
  WorldEntryVersion,
  WorldEntryCompetitor,
  WorldEntryEvidence,
} from "@/lib/engine-world-entry.functions";

const WORLD_ENTRY_SIDECAR_KEY = "world_entry_workspace";
const MODEL = "google/gemini-3.5-flash";

const input = z.object({ projectId: z.string().uuid() });

type DrafterOutput = {
  destination_summary: string;
  competitors: Array<{ name: string; positioning: string; why_relevant: string }>;
  vocabulary: string[];
  evidence_notes: Array<{ label: string; quote?: string; source_id?: string }>;
};

async function loadSources(sb: any, projectId: string) {
  const { data, error } = await sb
    .from("engine_sources")
    .select("id,name,type,raw_text")
    .eq("project_id", projectId)
    .not("raw_text", "is", null)
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string; type: string; raw_text: string | null }>;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
}

export const draftWorldEntryFromIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryState> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    const sources = await loadSources(sb, data.projectId);
    if (sources.length === 0) {
      throw new Error("No intake sources found. Add an intake brief before drafting the World Entry.");
    }
    const combined = sources
      .map((s) => `SOURCE ${s.id} [${s.type}] ${s.name}\n${(s.raw_text ?? "").slice(0, 6000)}`)
      .join("\n\n---\n\n")
      .slice(0, 30_000);

    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    const ai = await callLovableAi(
      [
        {
          role: "system",
          content:
            "You are a World Entry analyst. From raw client intake, draft: (1) a crisp industry-destination summary (where this business is going, in 2-4 sentences), (2) at least 4 real, plausible competitors with 1-line positioning and why-relevant, (3) 8-12 category vocabulary tokens (terms operators use inside this category), (4) short evidence notes tying claims back to a SOURCE id. Ground every claim in the material. Return strict JSON only.",
        },
        {
          role: "user",
          content: `INTAKE MATERIAL:\n\n${combined}\n\nReturn JSON:\n{\n  "destination_summary": "",\n  "competitors": [{"name":"","positioning":"","why_relevant":""}],\n  "vocabulary": [""],\n  "evidence_notes": [{"label":"","quote":"","source_id":""}]\n}`,
        },
      ],
      { json: true, temperature: 0.4, model: MODEL },
    );
    const parsed = parseJsonOutput<DrafterOutput>(ai.text);
    if (!parsed) throw new Error("Drafter returned unparseable JSON.");

    // Load sidecar via a fresh read (avoid circular import to functions file).
    const { data: row, error: readErr } = await sb
      .from("engine_projects")
      .select("spirit_first_analysis")
      .eq("id", data.projectId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const spirit = ((row?.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const priorState = (spirit[WORLD_ENTRY_SIDECAR_KEY] as WorldEntryState | undefined) ?? {
      current: null,
      history: [],
    };

    if (priorState.current?.status === "awaiting_review") {
      throw new Error("A draft is already awaiting review. Approve or reject it before drafting again.");
    }

    const now = new Date().toISOString();
    const currentIsApproved = priorState.current?.status === "approved";
    const nextHistory = currentIsApproved && priorState.current
      ? [...priorState.history, priorState.current]
      : priorState.history;
    const nextVersion = [
      ...nextHistory,
      ...(priorState.current && !currentIsApproved ? [priorState.current] : []),
    ].reduce((m, v) => Math.max(m, v.version), 0) + 1;

    const competitors: WorldEntryCompetitor[] = (parsed.competitors ?? [])
      .filter((c) => c?.name)
      .slice(0, 12)
      .map((c) => ({
        id: `ai-${slug(c.name)}-${Math.random().toString(36).slice(2, 6)}`,
        name: c.name.trim(),
        positioning: (c.positioning ?? "").trim(),
        why_relevant: (c.why_relevant ?? "").trim(),
      }));

    const vocabulary = Array.from(
      new Set(
        (parsed.vocabulary ?? [])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0 && v.length <= 60),
      ),
    ).slice(0, 20);

    const evidence: WorldEntryEvidence[] = (parsed.evidence_notes ?? [])
      .filter((e) => e?.label)
      .slice(0, 12)
      .map((e, i) => ({
        id: `ai-ev-${i}-${Math.random().toString(36).slice(2, 6)}`,
        label: e.label.trim(),
        source_id: e.source_id?.trim(),
        quote: e.quote?.trim(),
        added_by_email: actor,
        added_at: now,
      }));

    const draft: WorldEntryVersion = {
      version: nextVersion,
      status: "drafted",
      destination_summary: (parsed.destination_summary ?? "").trim(),
      competitors,
      vocabulary,
      evidence,
      drafted_by_email: actor,
      drafted_by_actor: "ai",
      drafted_at: now,
    };

    const nextState: WorldEntryState = { current: draft, history: nextHistory };
    const { error: upErr } = await sb
      .from("engine_projects")
      .update({ spirit_first_analysis: { ...spirit, [WORLD_ENTRY_SIDECAR_KEY]: nextState } })
      .eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);

    const { mirrorWorldEntryToFieldTruth } = await import("@/lib/engine-world-entry.functions");
    await mirrorWorldEntryToFieldTruth(sb, data.projectId, draft, actor, "ai");

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "world_entry.ai_drafted",
      title: `World Entry v${nextVersion} AI-drafted`,
      body: `Drafted by ${actor} from ${sources.length} source(s).`,
      severity: "info",
      actor_email: actor,
    });

    return nextState;
  });
