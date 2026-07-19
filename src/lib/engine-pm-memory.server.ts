/**
 * Server-only helpers to update PM memory from the synthesis orchestrator.
 * Not a server function — imported directly by orchestrator.server.
 */

type Sb = any;

export async function recordSynthesisIntoMemory(args: {
  supabase: Sb;
  projectId: string;
  actorEmail: string | null;
  ranStepIds: string[];
  errors: Array<{ id: string; message: string }>;
  readinessScore?: number | null;
}): Promise<void> {
  try {
    const { supabase, projectId } = args;
    const now = new Date().toISOString();
    const { data: row } = await supabase
      .from("engine_pm_memory")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    const base = row ?? {
      project_id: projectId,
      known_facts: [],
      working_assumptions: [],
      open_questions: [],
      decisions_log: [],
      ingested_sources: [],
    };

    // Log a decision for this run.
    const decisions = (base.decisions_log ?? []) as Array<{ id: string; text: string; actor_email?: string | null; decided_at: string }>;
    decisions.unshift({
      id: `dec_${Date.now().toString(36)}`,
      text:
        `Synthesis run — filled ${args.ranStepIds.length} step(s)` +
        (args.errors.length ? `, ${args.errors.length} error(s)` : ""),
      actor_email: args.actorEmail,
      decided_at: now,
    });

    // Convert failed steps into open questions so the user sees the gap.
    const open = (base.open_questions ?? []) as Array<{ id: string; text: string; blocks?: string[] }>;
    const existingTexts = new Set(open.map((q) => q.text));
    for (const err of args.errors) {
      const text = `Missing input for “${err.id}” — ${err.message}`;
      if (!existingTexts.has(text)) {
        open.unshift({
          id: `q_${err.id}_${Date.now().toString(36)}`,
          text,
          blocks: [err.id],
        });
      }
    }

    const patch = {
      project_id: projectId,
      known_facts: base.known_facts ?? [],
      working_assumptions: base.working_assumptions ?? [],
      open_questions: open.slice(0, 500),
      decisions_log: decisions.slice(0, 500),
      ingested_sources: base.ingested_sources ?? [],
      last_synthesis_at: now,
      last_readiness_score: args.readinessScore ?? base.last_readiness_score ?? null,
    };

    await supabase
      .from("engine_pm_memory")
      .upsert(patch, { onConflict: "project_id" });
  } catch {
    /* best-effort — memory updates never fail a synthesis run */
  }
}
