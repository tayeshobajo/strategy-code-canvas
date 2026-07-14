// Phase H6 · Q7 — Explicit model-selection scoring.
//
// Client-safe. Pure function used by `engine-ai-providers.server.ts` and
// surfaced on every `engine_agent_costs` row through the existing
// `metadata` jsonb column. No new schema.
//
// Dimensions (all 0..100, higher = better):
//   quality      — task-fit quality of the model on the given capability
//   privacy      — data-handling posture (self-host > EU > US enterprise > consumer)
//   cost         — inverse of $/1M tokens (cheaper = higher score)
//   reliability  — provider uptime + fallback availability
//   availability — is the provider currently reachable / not rate-limited
//
// The winning model is the one with the highest weighted sum for the
// task's requested weights.

export type ModelDimension =
  | "quality"
  | "privacy"
  | "cost"
  | "reliability"
  | "availability";

export type ModelScorecard = {
  model: string;
  provider: string;
  scores: Record<ModelDimension, number>; // 0..100
};

export type ModelSelectionWeights = Partial<Record<ModelDimension, number>>;

const DEFAULT_WEIGHTS: Record<ModelDimension, number> = {
  quality: 0.35,
  privacy: 0.20,
  cost: 0.20,
  reliability: 0.15,
  availability: 0.10,
};

// Baseline scorecards — kept as data so operators can adjust without
// changing selection code. Numbers are opinionated defaults, not vendor
// benchmarks.
export const BASELINE_SCORECARDS: ModelScorecard[] = [
  {
    model: "google/gemini-3-flash-preview",
    provider: "lovable-ai-gateway",
    scores: { quality: 72, privacy: 65, cost: 92, reliability: 82, availability: 90 },
  },
  {
    model: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    scores: { quality: 92, privacy: 78, cost: 55, reliability: 88, availability: 82 },
  },
  {
    model: "openai/gpt-5.5",
    provider: "openai",
    scores: { quality: 90, privacy: 70, cost: 60, reliability: 85, availability: 80 },
  },
];

export function scoreModel(
  card: ModelScorecard,
  weights?: ModelSelectionWeights,
): { total: number; breakdown: Record<ModelDimension, number> } {
  const w: Record<ModelDimension, number> = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const dims: ModelDimension[] = ["quality", "privacy", "cost", "reliability", "availability"];
  const total = dims.reduce((acc, d) => acc + (card.scores[d] ?? 0) * (w[d] ?? 0), 0);
  const breakdown: Record<ModelDimension, number> = {
    quality: 0, privacy: 0, cost: 0, reliability: 0, availability: 0,
  };
  for (const d of dims) breakdown[d] = (card.scores[d] ?? 0) * (w[d] ?? 0);
  return { total: Math.round(total * 10) / 10, breakdown };
}

export function selectBestModel(
  candidates: ModelScorecard[],
  weights?: ModelSelectionWeights,
): { winner: ModelScorecard; score: number; breakdown: Record<ModelDimension, number>; runnersUp: Array<{ model: string; score: number }> } {
  if (candidates.length === 0) throw new Error("selectBestModel: no candidates");
  const ranked = candidates
    .map((c) => ({ card: c, ...scoreModel(c, weights) }))
    .sort((a, b) => b.total - a.total);
  const [winner, ...rest] = ranked;
  return {
    winner: winner.card,
    score: winner.total,
    breakdown: winner.breakdown,
    runnersUp: rest.slice(0, 3).map((r) => ({ model: r.card.model, score: r.total })),
  };
}

/** Payload written to `engine_agent_costs.metadata.model_selection`. */
export function selectionAuditPayload(args: {
  taskKind: string;
  weights: ModelSelectionWeights;
  winner: ModelScorecard;
  score: number;
  breakdown: Record<ModelDimension, number>;
}) {
  return {
    task_kind: args.taskKind,
    weights: { ...DEFAULT_WEIGHTS, ...args.weights },
    winner: { model: args.winner.model, provider: args.winner.provider, scores: args.winner.scores },
    total_score: args.score,
    weighted_breakdown: args.breakdown,
    scored_at: new Date().toISOString(),
  };
}
