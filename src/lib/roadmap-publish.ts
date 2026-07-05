/**
 * Pure helpers for the portal publish pipeline.
 *
 * `buildClientSafePayload` takes an arbitrary engine_roadmap_versions.payload
 * blob and projects it down to only the fields that belong in the client
 * portal. Anything not in the explicit allow-list (agent costs, AI
 * confidence scores, internal notes, provenance, source ids, etc.) is
 * dropped so it can never leak into a published record.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type ClientSafeRoadmap = {
  title: string;
  version_label: string;
  executive_summary: string | null;
  current_diagnosis: string | null;
  strategic_priorities: Array<{ title: string; detail?: string }>;
  sequence_30_60_90: { "30"?: string[]; "60"?: string[]; "90"?: string[] };
  risks_dependencies: Array<{ risk: string; mitigation?: string }>;
  recommended_next_move: string | null;
  supporting_notes: string | null;
};

const pickString = (v: Any): string | null => {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

const pickPriorities = (v: Any): ClientSafeRoadmap["strategic_priorities"] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((p: Any) => {
      if (typeof p === "string") return { title: p };
      if (p && typeof p === "object") {
        const title = pickString(p.title) ?? pickString(p.name);
        if (!title) return null;
        const detail = pickString(p.detail) ?? pickString(p.description) ?? undefined;
        return { title, detail };
      }
      return null;
    })
    .filter((x): x is { title: string; detail?: string } => !!x);
};

const pickSequence = (v: Any): ClientSafeRoadmap["sequence_30_60_90"] => {
  if (!v || typeof v !== "object") return {};
  const out: ClientSafeRoadmap["sequence_30_60_90"] = {};
  for (const k of ["30", "60", "90"] as const) {
    const raw = v[k];
    if (!raw) continue;
    const arr = Array.isArray(raw) ? raw : [raw];
    const cleaned = arr.map((x: Any) => (typeof x === "string" ? x : String(x?.title ?? x?.name ?? ""))).filter(Boolean);
    if (cleaned.length) out[k] = cleaned;
  }
  return out;
};

const pickRisks = (v: Any): ClientSafeRoadmap["risks_dependencies"] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((r: Any) => {
      if (typeof r === "string") return { risk: r };
      if (r && typeof r === "object") {
        const risk = pickString(r.risk) ?? pickString(r.title);
        if (!risk) return null;
        const mitigation = pickString(r.mitigation) ?? pickString(r.detail) ?? undefined;
        return { risk, mitigation };
      }
      return null;
    })
    .filter((x): x is { risk: string; mitigation?: string } => !!x);
};

export function buildClientSafePayload(input: {
  version_label: string;
  title: string;
  payload: Any;
  client_preview_override?: Any;
}): ClientSafeRoadmap {
  // Prefer the operator-curated `client_preview` block if the payload carries
  // one (engine workspace stores this as project.client_preview and mirrors it
  // into version payloads). Otherwise, best-effort map from the raw modules.
  const src =
    (input.client_preview_override && typeof input.client_preview_override === "object"
      ? input.client_preview_override
      : null) ??
    (input.payload && typeof input.payload === "object" && input.payload.client_preview
      ? input.payload.client_preview
      : null) ??
    input.payload ??
    {};

  const roadmap = src.roadmap ?? src.builder ?? src ?? {};
  const pointA = src.point_a ?? {};
  const blueprint = src.blueprint ?? {};

  const out: ClientSafeRoadmap = {
    title: input.title,
    version_label: input.version_label,
    executive_summary:
      pickString(src.executive_summary) ??
      pickString(src.summary) ??
      pickString(blueprint.summary) ??
      null,
    current_diagnosis:
      pickString(src.current_diagnosis) ??
      pickString(pointA.diagnosis) ??
      pickString(pointA.summary) ??
      null,
    strategic_priorities: pickPriorities(
      src.strategic_priorities ?? blueprint.priorities ?? roadmap.priorities,
    ),
    sequence_30_60_90: pickSequence(src.sequence_30_60_90 ?? src.sequence),
    risks_dependencies: pickRisks(src.risks_dependencies ?? src.risks),
    recommended_next_move:
      pickString(src.recommended_next_move) ??
      pickString(src.next_move) ??
      null,
    supporting_notes:
      pickString(src.supporting_notes) ?? pickString(src.client_notes) ?? null,
  };

  // Runtime allowlist guard — belt-and-suspenders against future refactors
  // that accidentally spread internal fields onto the client payload. In
  // dev/test this throws; in prod it logs so we don't take down publishing
  // over a benign new key, but the log will surface in ops immediately.
  const extra = Object.keys(out).filter(
    (k) => !CLIENT_SAFE_KEYS.includes(k as (typeof CLIENT_SAFE_KEYS)[number]),
  );
  if (extra.length) {
    const msg = `buildClientSafePayload: non-allowlisted keys detected: ${extra.join(", ")}`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    // eslint-disable-next-line no-console
    console.error(msg);
  }
  return out;
}

/**
 * Explicit key-list to defend against future payload keys leaking into
 * publications. Anything not listed here is stripped before insert.
 */
export const CLIENT_SAFE_KEYS = [
  "title",
  "version_label",
  "executive_summary",
  "current_diagnosis",
  "strategic_priorities",
  "sequence_30_60_90",
  "risks_dependencies",
  "recommended_next_move",
  "supporting_notes",
] as const;
