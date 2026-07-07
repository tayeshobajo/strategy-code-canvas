// Server-only hybrid AI provider layer for the Roadmap Engine.
// - Intake pass: Lovable AI Gateway / Gemini Flash (fast, cheap).
// - Structured pass: Anthropic Claude Sonnet (higher quality reasoning).
// Providers are swappable behind these two functions — do not import
// providers directly from callers.

import { callLovableAi, parseJsonOutput } from "@/lib/engine-ai.server";

/* ----------------------------- Types ---------------------------------- */

export type IntakeResult = {
  summary: string;
  cleaned_text: string;
  keywords: string[];
  provider: string;
  model: string;
  cost_cents: number;
};

/**
 * Canonical signal categories — mirrors the `engine_signal_category` Postgres
 * enum. Runtime source of truth shared by the full pipeline and the
 * single-source extractor so every path writes the same taxonomy into
 * `engine_extracted_signals`.
 */
export const SIGNAL_CATEGORIES = [
  "goal",
  "pain",
  "opportunity",
  "deadline",
  "constraint",
  "decision_maker",
  "hidden_asset",
  "risk",
  "required_system",
  "milestone_candidate",
  "investment_signal",
  "client_language",
  "open_question",
  "business_model",
  "current_system",
] as const;
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export type ExtractedSignalInput = {
  category: SignalCategory;
  label: string;
  detail?: string;
  confidence?: number;
  client_safe?: boolean;
};

export type DraftModules = {
  extraction?: { confidence?: number; items?: string[] };
  point_a?: { confidence?: number; diagnosis?: string };
  point_b?: { confidence?: number; destination?: string };
  hidden_assets?: { confidence?: number; assets?: string[] };
  gap_map?: { confidence?: number; gaps?: string[] };
  blueprint?: { confidence?: number; nodes?: string[] };
  roadmap?: { confidence?: number; phases?: Array<{ name: string; milestones: string[] }> };
  sequencing?: { confidence?: number; order?: string[] };
  deadlines?: { confidence?: number; critical?: Array<{ label: string; due_on: string }> };
  investment?: { confidence?: number; range_low_usd?: number; range_high_usd?: number; notes?: string };
  client_preview?: { confidence?: number; executive_summary?: string };
};

export type StructuredResult = {
  summary: string;
  overall_confidence: number;
  signals: ExtractedSignalInput[];
  modules: DraftModules;
  change_events: Array<{
    kind: string;
    title: string;
    body?: string;
    severity?: string;
    affected_module?: string;
  }>;
  provider: string;
  model: string;
  cost_cents: number;
};

/* ----------------------------- Intake pass ---------------------------- */

const INTAKE_MODEL = "google/gemini-3-flash-preview";

export async function runIntakePass(args: {
  sourceName: string;
  sourceType: string;
  text: string;
}): Promise<IntakeResult> {
  const trimmed = args.text.slice(0, 40_000);
  if (!trimmed.trim()) {
    return {
      summary: "",
      cleaned_text: "",
      keywords: [],
      provider: "lovable-gemini",
      model: INTAKE_MODEL,
      cost_cents: 0,
    };
  }

  const ai = await callLovableAi(
    [
      {
        role: "system",
        content:
          "You are a lightweight intake reader. Clean the source, produce a short factual summary, and pull the most relevant keywords. Never invent. Return strict JSON.",
      },
      {
        role: "user",
        content: `SOURCE: ${args.sourceName} (${args.sourceType})

${trimmed}

Return JSON:
{
  "summary": "2-4 sentence factual summary",
  "cleaned_text": "the source with obvious noise removed, up to 20000 chars",
  "keywords": ["...", "..."]
}`,
      },
    ],
    { model: INTAKE_MODEL, json: true, temperature: 0.1 },
  );

  const parsed = parseJsonOutput<{ summary?: string; cleaned_text?: string; keywords?: string[] }>(
    ai.text,
  );
  return {
    summary: parsed?.summary ?? "",
    cleaned_text: parsed?.cleaned_text ?? trimmed,
    keywords: (parsed?.keywords ?? []).slice(0, 20),
    provider: "lovable-gemini",
    model: INTAKE_MODEL,
    cost_cents: ai.cost_cents,
  };
}

/* --------------------------- Structured pass -------------------------- */

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

// Approximate Claude Sonnet 4.5 pricing (cents per 1M tokens)
const CLAUDE_IN_CENTS_PER_M = 300; // $3.00
const CLAUDE_OUT_CENTS_PER_M = 1500; // $15.00

async function callClaudeJson(system: string, user: string): Promise<{ text: string; cost_cents: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
  const res = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error(`Claude rate limited. Retry shortly.`);
    if (res.status === 401) throw new Error(`Claude auth failed — check ANTHROPIC_API_KEY.`);
    throw new Error(`Claude ${res.status}: ${errText || res.statusText}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
  const tin = data.usage?.input_tokens ?? 0;
  const tout = data.usage?.output_tokens ?? 0;
  const cost_cents = Math.max(
    1,
    Math.round((tin * CLAUDE_IN_CENTS_PER_M) / 1_000_000 + (tout * CLAUDE_OUT_CENTS_PER_M) / 1_000_000),
  );
  return { text, cost_cents };
}

export type PriorMemoryEntry = {
  title: string;
  type: string;
  summary?: string | null;
  confidence?: number | null;
  source?: string | null;
  captured_at?: string | null;
};

export async function runStructuredPass(args: {
  projectName: string;
  clientCompany?: string | null;
  currentApprovedVersion?: string | null;
  currentDraftVersion?: string | null;
  currentModules: Record<string, unknown>;
  intake: IntakeResult[];
  sources: Array<{ id: string; name: string; type: string; url?: string | null }>;
  priorMemory?: PriorMemoryEntry[];
}): Promise<StructuredResult> {
  const system = `You are the Trust Tai Roadmap Intelligence Engine. Read the provided source intake data and produce a strictly-valid JSON roadmap draft with structured signals. Never invent facts — when unknown, say "unknown". Confidence is 0-100. Keep language sentence-case, no em-dashes, no exclamation points. Every signal must be traceable to something the sources actually stated. Prior Intelligence Memory entries represent durable, previously-captured facts about this project — treat them as authoritative unless the new sources contradict them, and prefer reusing their exact wording when producing new signals.`;

  const intakeBlock = args.intake
    .map(
      (r, i) =>
        `[Source ${i + 1}] ${args.sources[i]?.name ?? "?"} (${args.sources[i]?.type ?? "?"})
Summary: ${r.summary}
Keywords: ${r.keywords.join(", ")}
Text (truncated):
${r.cleaned_text.slice(0, 8_000)}`,
    )
    .join("\n\n---\n\n");

  const memoryBlock = (args.priorMemory ?? []).length
    ? (args.priorMemory ?? [])
        .slice(0, 60)
        .map(
          (m) =>
            `- [${m.type}${typeof m.confidence === "number" ? ` · ${m.confidence}` : ""}] ${m.title}${m.summary ? ` — ${m.summary}` : ""}${m.source ? ` (source: ${m.source})` : ""}`,
        )
        .join("\n")
    : "(no prior memory captured yet)";

  const user = `PROJECT: ${args.projectName} (${args.clientCompany ?? "—"})
CURRENT APPROVED VERSION: ${args.currentApprovedVersion ?? "none"}
CURRENT DRAFT: ${args.currentDraftVersion ?? "none"}

PRIOR INTELLIGENCE MEMORY (durable facts already captured for this project):
${memoryBlock}

CURRENT MODULES (JSON, may be empty):
${JSON.stringify(args.currentModules, null, 2).slice(0, 8_000)}

SOURCE INTAKE:
${intakeBlock || "(no intake data)"}

Return JSON with this exact shape:
{
  "summary": "1-2 sentence description of what changed",
  "overall_confidence": 0-100,
  "signals": [
    { "category": "goal|pain|opportunity|deadline|constraint|decision_maker|hidden_asset|risk|required_system|milestone_candidate|investment_signal|client_language|open_question|business_model|current_system",
      "label": "short one-line signal",
      "detail": "supporting detail from the source",
      "confidence": 0-100,
      "client_safe": false }
  ],
  "modules": {
    "extraction": { "confidence": 0-100, "items": ["..."] },
    "point_a": { "confidence": 0-100, "diagnosis": "..." },
    "point_b": { "confidence": 0-100, "destination": "..." },
    "hidden_assets": { "confidence": 0-100, "assets": ["..."] },
    "gap_map": { "confidence": 0-100, "gaps": ["..."] },
    "blueprint": { "confidence": 0-100, "nodes": ["..."] },
    "roadmap": { "confidence": 0-100, "phases": [{"name":"","milestones":["..."]}] },
    "sequencing": { "confidence": 0-100, "order": ["..."] },
    "deadlines": { "confidence": 0-100, "critical": [{"label":"","due_on":""}] },
    "investment": { "confidence": 0-100, "range_low_usd": 0, "range_high_usd": 0, "notes": "" },
    "client_preview": { "confidence": 0-100, "executive_summary": "" }
  },
  "change_events": [
    { "kind": "new_info|conflict|opportunity|risk|deadline_change|scope_change|investment_impact|client_copy_affected",
      "title": "", "body": "", "severity": "info|warn|critical", "affected_module": "" }
  ]
}

Return JSON only. No prose, no markdown fences.`;

  // Try Claude first; on any failure (missing key, provider error), fall back
  // to Lovable Gemini so the pipeline still produces a draft.
  try {
    const { text, cost_cents } = await callClaudeJson(system, user);
    const parsed = parseJsonOutput<Omit<StructuredResult, "provider" | "model" | "cost_cents">>(text);
    if (!parsed) throw new Error("Claude returned non-JSON output");
    return normalizeStructured(parsed, { provider: "anthropic", model: CLAUDE_MODEL, cost_cents });
  } catch (claudeErr) {
    const fallback = await callLovableAi(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { json: true, temperature: 0.2 },
    );
    const parsed = parseJsonOutput<Omit<StructuredResult, "provider" | "model" | "cost_cents">>(
      fallback.text,
    );
    if (!parsed) {
      throw new Error(
        `Structured pass failed. Claude: ${(claudeErr as Error).message}. Gemini fallback returned non-JSON output.`,
      );
    }
    return normalizeStructured(parsed, {
      provider: "lovable-gemini-fallback",
      model: INTAKE_MODEL,
      cost_cents: fallback.cost_cents,
    });
  }
}

function normalizeStructured(
  parsed: Partial<StructuredResult>,
  meta: { provider: string; model: string; cost_cents: number },
): StructuredResult {
  return {
    summary: parsed.summary ?? "Draft updated from new sources.",
    overall_confidence: Math.min(100, Math.max(0, parsed.overall_confidence ?? 60)),
    signals: (parsed.signals ?? []).slice(0, 80),
    modules: parsed.modules ?? {},
    change_events: (parsed.change_events ?? []).slice(0, 20),
    ...meta,
  };
}
