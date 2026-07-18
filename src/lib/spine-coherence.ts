/**
 * Spine coherence guards.
 *
 * The Project Spine renders truth in multiple places (Point A/B cards,
 * status strip, roadmap strip). These helpers prevent contradictory
 * states — e.g. showing "Approved" while the underlying body is empty —
 * and provide canonical bullet extraction so mirrored cards look truly
 * identical.
 */

import { isApprovedTruth, type SpineStatusPresentation } from "./spine-truth-status";
import { presentationFor } from "./spine-truth-status";
import type { SpineFieldStatus } from "./spine-contract";

export type PointKey = "A" | "B";

const POINT_A_KEYS = [
  "current_state",
  "challenges",
  "summary",
  "description",
  "key_diagnosis",
];

const POINT_B_KEYS = [
  "destination",
  "goal",
  "vision",
  "success_looks_like",
  "frame",
  "24_month_destination",
  "10_year_position",
];

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => stringifyValue(x))
      .filter(Boolean)
      .join(" · ");
  }
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    const label = rec["title"] ?? rec["label"] ?? rec["name"] ?? rec["statement"];
    if (typeof label === "string") return label.trim();
  }
  return "";
}

export function extractPointBullets(
  record: Record<string, unknown> | null | undefined,
  point: PointKey,
  limit = 4,
): string[] {
  if (!record) return [];
  const keys = point === "A" ? POINT_A_KEYS : POINT_B_KEYS;
  const out: string[] = [];
  for (const k of keys) {
    const v = record[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        const s = stringifyValue(item);
        if (s) out.push(s);
        if (out.length >= limit) break;
      }
    } else {
      const s = stringifyValue(v);
      if (s) out.push(s);
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function hasContent(
  record: Record<string, unknown> | null | undefined,
  point: PointKey,
): boolean {
  return extractPointBullets(record, point, 1).length > 0;
}

/**
 * Adjust presentation so a card can never render "Approved" over an empty
 * body. If the durable status says approved but no content exists, we
 * degrade to a "review" tone with a "Content pending" label.
 */
export function coherentPresentation(
  status: SpineFieldStatus | null,
  bulletsCount: number,
): SpineStatusPresentation {
  const base = presentationFor(status);
  if (isApprovedTruth(status) && bulletsCount === 0) {
    return { ...base, label: "Content pending", tone: "review" };
  }
  return base;
}

export function isApprovedWithContent(
  status: SpineFieldStatus | null,
  bulletsCount: number,
): boolean {
  return isApprovedTruth(status) && bulletsCount > 0;
}

export function confidenceLabel(
  status: SpineFieldStatus | null,
  bulletsCount: number,
): "High" | "Medium" | "Low" | "—" {
  if (isApprovedWithContent(status, bulletsCount)) return "High";
  if (status === "verified") return "High";
  if (status === "needs_confirmation" || status === "accepted_assumption" || status === "inferred") return "Medium";
  if (status === "contradictory") return "Low";
  if (bulletsCount > 0) return "Medium";
  return "—";
}
