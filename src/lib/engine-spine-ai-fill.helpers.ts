import { POINT_B_FIELD_KEYS } from "@/lib/engine-spine-fields";

export type EpistemicStatus =
  | "stated"
  | "inferred"
  | "assumed"
  | "missing"
  | "contradicted"
  | "needs_confirmation"
  | "verified"
  | "approved_truth";

export type Lens = { label: string; value: string; hint: string };
export type DiagnosisCard = { title: string; tag: string; bullets: string[] };
export type PointA = { lenses?: Lens[]; diagnosis?: DiagnosisCard[]; key_diagnosis?: string };
export type PointB = Record<(typeof POINT_B_FIELD_KEYS)[number], string>;
export type FillResult = { ok: true; changed: string[]; statuses: string[] };
export type TruthRow = { field_key: string; status: EpistemicStatus; spine: string };

export const HUMAN_LOCKED_STATUSES = new Set<EpistemicStatus>([
  "stated",
  "verified",
  "approved_truth",
  "contradicted",
]);

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(asRecord(value)).length === 0;
  return false;
}

export function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, 1_200) : fallback;
}

export function normalizePointA(raw: unknown): PointA {
  const rec = asRecord(raw);
  const lenses = Array.isArray(rec.lenses)
    ? rec.lenses
        .map((item) => {
          const r = asRecord(item);
          return {
            label: cleanString(r.label, "Lens").slice(0, 48),
            value: cleanString(r.value, "Needs review").slice(0, 96),
            hint: cleanString(r.hint, "Drafted from intake context.").slice(0, 180),
          };
        })
        .filter((lens) => lens.label && lens.value)
        .slice(0, 6)
    : [];

  const diagnosis = Array.isArray(rec.diagnosis)
    ? rec.diagnosis
        .map((item) => {
          const r = asRecord(item);
          const bullets = Array.isArray(r.bullets)
            ? r.bullets
                .map((bullet) => cleanString(bullet).slice(0, 240))
                .filter(Boolean)
                .slice(0, 4)
            : cleanString(r.bullets)
              ? [cleanString(r.bullets).slice(0, 240)]
              : [];
          return {
            title: cleanString(r.title, "Working diagnosis").slice(0, 80),
            tag: cleanString(r.tag, "DEFAULT").toUpperCase().slice(0, 24),
            bullets: bullets.length ? bullets : ["Needs confirmation from Tai before approval."],
          };
        })
        .filter((card) => card.title)
        .slice(0, 6)
    : [];

  return {
    lenses,
    diagnosis,
    key_diagnosis: cleanString(rec.key_diagnosis).slice(0, 1_000),
  };
}

export function normalizePointB(raw: unknown): Partial<PointB> {
  const rec = asRecord(raw);
  const out: Partial<PointB> = {};
  for (const key of POINT_B_FIELD_KEYS) {
    const value = cleanString(rec[key]).slice(0, 1_000);
    if (value) out[key] = value;
  }
  return out;
}

export function changedKeys(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
  return keys.filter(
    (key) => JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null),
  );
}

export function mapTruth(rows: TruthRow[], spine: "point-a" | "point-b") {
  return new Map(
    rows.filter((row) => row.spine === spine).map((row) => [row.field_key, row.status] as const),
  );
}