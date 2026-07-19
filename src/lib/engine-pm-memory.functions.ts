/**
 * AI PM Memory — per-project brain.
 *
 * Stores known facts, working assumptions, open questions, and a decisions log
 * so the AI Product Manager has durable context between runs. Server functions
 * here are the only writers; UI + orchestrator call them.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const uuid = z.string().uuid();

export type PmFact = {
  id: string;
  text: string;
  source: string; // e.g. "intake", "chat", "upload:brief.pdf", "manual"
  captured_at: string;
  captured_by?: string | null;
};

export type PmAssumption = {
  id: string;
  text: string;
  confidence: "low" | "medium" | "high";
  rationale?: string;
  captured_at: string;
};

export type PmQuestion = {
  id: string;
  text: string;
  blocks?: string[]; // readiness check ids blocked by this gap
  answered_at?: string | null;
  answer?: string | null;
};

export type PmDecision = {
  id: string;
  text: string;
  actor_email?: string | null;
  decided_at: string;
};

export type PmIngestedSource = {
  id: string;
  kind: "chat" | "upload" | "intake" | "synthesis" | "manual";
  ref: string;
  summary?: string;
  ingested_at: string;
};

export type PmMemory = {
  project_id: string;
  known_facts: PmFact[];
  working_assumptions: PmAssumption[];
  open_questions: PmQuestion[];
  decisions_log: PmDecision[];
  ingested_sources: PmIngestedSource[];
  last_synthesis_at: string | null;
  last_readiness_score: number | null;
  updated_at: string | null;
};

const EMPTY = (projectId: string): PmMemory => ({
  project_id: projectId,
  known_facts: [],
  working_assumptions: [],
  open_questions: [],
  decisions_log: [],
  ingested_sources: [],
  last_synthesis_at: null,
  last_readiness_score: null,
  updated_at: null,
});

async function assertStaff(context: unknown): Promise<string> {
  const ctx = context as { supabase: any; claims?: { email?: string } };
  const email = (ctx.claims?.email ?? "").toLowerCase();
  const [isOp, isAdmin] = await Promise.all([
    hasRoleForEmail(ctx.supabase, email, "operator"),
    hasRoleForEmail(ctx.supabase, email, "admin"),
  ]);
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator or admin role required");
  return email;
}

export const getPmMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<PmMemory> => {
    await assertStaff(context);
    const sb = (context as any).supabase;
    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) return EMPTY(data.projectId);
    return {
      project_id: data.projectId,
      known_facts: (row.known_facts ?? []) as PmFact[],
      working_assumptions: (row.working_assumptions ?? []) as PmAssumption[],
      open_questions: (row.open_questions ?? []) as PmQuestion[],
      decisions_log: (row.decisions_log ?? []) as PmDecision[],
      ingested_sources: (row.ingested_sources ?? []) as PmIngestedSource[],
      last_synthesis_at: row.last_synthesis_at ?? null,
      last_readiness_score: row.last_readiness_score ?? null,
      updated_at: row.updated_at ?? null,
    };
  });

const noteSchema = z.object({
  projectId: uuid,
  kind: z.enum(["fact", "assumption", "question", "decision"]),
  text: z.string().min(2).max(4_000),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().max(2_000).optional(),
});

function rid(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function upsertMemory(sb: any, projectId: string, patch: Partial<PmMemory>) {
  const { data: existing } = await sb
    .from("engine_pm_memory")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  const base = existing ?? { project_id: projectId };
  const merged = { ...base, ...patch, project_id: projectId };
  const { error } = await sb
    .from("engine_pm_memory")
    .upsert(merged, { onConflict: "project_id" });
  if (error) throw new Error(error.message ?? "PM memory upsert failed");
}

export const addPmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => noteSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const email = await assertStaff(context);
    const sb = (context as any).supabase;
    const now = new Date().toISOString();

    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    const mem: PmMemory = row
      ? {
          project_id: data.projectId,
          known_facts: row.known_facts ?? [],
          working_assumptions: row.working_assumptions ?? [],
          open_questions: row.open_questions ?? [],
          decisions_log: row.decisions_log ?? [],
          ingested_sources: row.ingested_sources ?? [],
          last_synthesis_at: row.last_synthesis_at,
          last_readiness_score: row.last_readiness_score,
          updated_at: row.updated_at,
        }
      : EMPTY(data.projectId);

    if (data.kind === "fact") {
      mem.known_facts = [
        { id: rid(), text: data.text, source: "manual", captured_at: now, captured_by: email },
        ...mem.known_facts,
      ].slice(0, 500);
    } else if (data.kind === "assumption") {
      mem.working_assumptions = [
        {
          id: rid(),
          text: data.text,
          confidence: data.confidence ?? "medium",
          rationale: data.rationale,
          captured_at: now,
        },
        ...mem.working_assumptions,
      ].slice(0, 500);
    } else if (data.kind === "question") {
      mem.open_questions = [
        { id: rid(), text: data.text, answered_at: null, answer: null },
        ...mem.open_questions,
      ].slice(0, 500);
    } else {
      mem.decisions_log = [
        { id: rid(), text: data.text, actor_email: email, decided_at: now },
        ...mem.decisions_log,
      ].slice(0, 500);
    }

    await upsertMemory(sb, data.projectId, mem);
    return { ok: true as const };
  });

const answerSchema = z.object({
  projectId: uuid,
  questionId: z.string().min(1),
  answer: z.string().min(1).max(4_000),
});

export const answerPmQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => answerSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const email = await assertStaff(context);
    const sb = (context as any).supabase;
    const now = new Date().toISOString();
    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("open_questions, known_facts")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const qs: PmQuestion[] = row.open_questions ?? [];
    const idx = qs.findIndex((q) => q.id === data.questionId);
    if (idx < 0) return { ok: false as const };
    qs[idx] = { ...qs[idx], answer: data.answer, answered_at: now };
    // Promote the answer to a fact.
    const facts: PmFact[] = row.known_facts ?? [];
    facts.unshift({
      id: rid(),
      text: `${qs[idx].text} — ${data.answer}`,
      source: "chat",
      captured_at: now,
      captured_by: email,
    });
    await upsertMemory(sb, data.projectId, {
      open_questions: qs,
      known_facts: facts.slice(0, 500),
    });
    return { ok: true as const };
  });

const removeSchema = z.object({
  projectId: uuid,
  kind: z.enum(["fact", "assumption", "question", "decision"]),
  id: z.string().min(1),
});

export const removePmEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => removeSchema.parse(raw))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const sb = (context as any).supabase;
    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const key =
      data.kind === "fact"
        ? "known_facts"
        : data.kind === "assumption"
          ? "working_assumptions"
          : data.kind === "question"
            ? "open_questions"
            : "decisions_log";
    const arr = (row[key] ?? []) as Array<{ id: string }>;
    const next = arr.filter((x) => x.id !== data.id);
    await upsertMemory(sb, data.projectId, { [key]: next } as Partial<PmMemory>);
    return { ok: true as const };
  });

const updateSchema = z.object({
  projectId: uuid,
  kind: z.enum(["fact", "assumption", "question", "decision"]),
  id: z.string().min(1),
  text: z.string().min(2).max(4_000),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export const updatePmEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => updateSchema.parse(raw))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const sb = (context as any).supabase;
    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const key =
      data.kind === "fact"
        ? "known_facts"
        : data.kind === "assumption"
          ? "working_assumptions"
          : data.kind === "question"
            ? "open_questions"
            : "decisions_log";
    const arr = (row[key] ?? []) as Array<Record<string, unknown> & { id: string }>;
    const next = arr.map((x) =>
      x.id === data.id
        ? {
            ...x,
            text: data.text,
            ...(data.confidence && data.kind === "assumption" ? { confidence: data.confidence } : {}),
          }
        : x,
    );
    await upsertMemory(sb, data.projectId, { [key]: next } as Partial<PmMemory>);
    return { ok: true as const };
  });

const approveSchema = z.object({
  projectId: uuid,
  assumptionId: z.string().min(1),
  text: z.string().min(2).max(4_000).optional(),
});

export const approvePmAssumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => approveSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const email = await assertStaff(context);
    const sb = (context as any).supabase;
    const now = new Date().toISOString();
    const { data: row } = await sb
      .from("engine_pm_memory")
      .select("working_assumptions, known_facts, decisions_log")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const assumptions: PmAssumption[] = row.working_assumptions ?? [];
    const idx = assumptions.findIndex((a) => a.id === data.assumptionId);
    if (idx < 0) return { ok: false as const };
    const approved = assumptions[idx];
    const finalText = data.text?.trim() || approved.text;
    const remaining = assumptions.filter((a) => a.id !== data.assumptionId);
    const facts: PmFact[] = row.known_facts ?? [];
    facts.unshift({
      id: rid(),
      text: finalText,
      source: "approved-assumption",
      captured_at: now,
      captured_by: email,
    });
    const decisions: PmDecision[] = row.decisions_log ?? [];
    decisions.unshift({
      id: rid(),
      text: `Approved assumption: ${finalText}`,
      actor_email: email,
      decided_at: now,
    });
    await upsertMemory(sb, data.projectId, {
      working_assumptions: remaining,
      known_facts: facts.slice(0, 500),
      decisions_log: decisions.slice(0, 500),
    });
    return { ok: true as const };
  });
