// Phase H6 · I11 — Weighted risk-score helper for the approvals queue.
//
// Pure function. Zero I/O, zero DB. The eventual DB column
// `engine_review_items.risk_score` (see PENDING_MIGRATIONS §H6-I11) will
// be populated by a trigger using the SAME formula so app-side sort and
// DB sort stay in lockstep.
//
// Formula: risk_score (0..100) = clamp( impact * 0.4 + urgency * 0.4 + deadline * 0.2 )
// where every component is normalised 0..100.

export type ReviewRiskInput = {
  severity: "low" | "medium" | "high" | "critical" | null | undefined;
  impactScore: number | null | undefined;   // 0..100
  urgencyScore: number | null | undefined;  // 0..100
  clientRisk: boolean | null | undefined;
  deadlineAt: string | Date | null | undefined;
  nowMs?: number;                            // testable
};

const SEVERITY_FALLBACK: Record<string, number> = {
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function deadlineComponent(deadlineAt: ReviewRiskInput["deadlineAt"], nowMs: number): number {
  if (!deadlineAt) return 0;
  const t = deadlineAt instanceof Date ? deadlineAt.getTime() : Date.parse(String(deadlineAt));
  if (!Number.isFinite(t)) return 0;
  const daysAway = (t - nowMs) / 86_400_000;
  if (daysAway <= 0) return 100;
  if (daysAway <= 1) return 90;
  if (daysAway <= 3) return 75;
  if (daysAway <= 7) return 60;
  if (daysAway <= 14) return 40;
  if (daysAway <= 30) return 25;
  return 10;
}

export function computeReviewRiskScore(input: ReviewRiskInput): number {
  const nowMs = input.nowMs ?? Date.now();
  const sevFallback = SEVERITY_FALLBACK[input.severity ?? "medium"] ?? 45;
  const impact = input.impactScore ?? sevFallback;
  const urgency = input.urgencyScore ?? sevFallback;
  const deadline = deadlineComponent(input.deadlineAt, nowMs);
  const base = impact * 0.4 + urgency * 0.4 + deadline * 0.2;
  const withClientBoost = input.clientRisk ? base + 10 : base;
  return clamp(withClientBoost);
}

export function riskBand(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}
