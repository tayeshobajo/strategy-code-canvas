/**
 * Pure helpers for the portal publish pipeline.
 *
 * `buildClientSafePayload` takes an arbitrary engine_roadmap_versions.payload
 * blob and projects it down to only the fields that belong in the client
 * portal. Anything not in the explicit allow-list (agent costs, AI
 * confidence scores, internal notes, provenance, source ids, etc.) is
 * dropped so it can never leak into a published record.
 *
 * It also generates a typed `client_safe_canvas` snapshot — the structured
 * Point A → phases → Point B model that the portal canvas prefers over the
 * legacy `sequence_30_60_90` fallback. The snapshot is derived at publish
 * time from the approved roadmap version and the operator-curated
 * `client_preview` block; the portal never reads engine_* tables directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type CanvasItemType =
  | "milestone"
  | "decision"
  | "deliverable"
  | "deadline"
  | "client_action"
  | "meeting";

export type CanvasItemStatus =
  | "completed"
  | "in_progress"
  | "upcoming"
  | "blocked"
  | "optional";

export type ClientSafeCanvasItem = {
  id: string;
  title: string;
  type: CanvasItemType;
  status: CanvasItemStatus;
  phaseId: string | null;
  sequence: number;
  priority: "high" | "medium" | "low" | null;
  clientSafeDescription: string | null;
  whyItMatters: string | null;
  whatItUnlocks: string[];
  targetDate: string | null;
  relatedFiles: Array<{ label: string; url?: string; fileId?: string }>;
  actionNeeded: string | null;
};

export type ClientSafeCanvasPhase = {
  id: string;
  label: string;
  timeframe: string | null;
  summary: string | null;
  sequence: number;
};

export type CanvasPointSource = "authored" | "fallback";
export type ClientSafeCanvasPoint = {
  label: string;
  detail: string | null;
  /**
   * "authored" — detail came from the engine-authored project field or an
   * explicit canvas point in the version payload. "fallback" — derived
   * filler (current_diagnosis / executive_summary). Lets downstream UI
   * distinguish real truth from best-effort derivation.
   */
  source: CanvasPointSource;
};
export type ClientSafeCanvas = {
  pointA: ClientSafeCanvasPoint;
  pointB: ClientSafeCanvasPoint;
  phases: ClientSafeCanvasPhase[];
  milestones: ClientSafeCanvasItem[];
  decisions: ClientSafeCanvasItem[];
  deliverables: ClientSafeCanvasItem[];
  deadlines: ClientSafeCanvasItem[];
  clientActions: ClientSafeCanvasItem[];
};

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
  client_safe_canvas: ClientSafeCanvas;
};

const pickString = (v: Any): string | null => {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

/**
 * engine_projects.point_a / point_b are jsonb modules, not plain strings —
 * the workspace stores { key_diagnosis, diagnosis, lenses } for Point A and
 * { "24_month_destination", ... } for Point B, while the AI pipeline writes
 * { confidence, diagnosis } / { confidence, destination }. Pull the authored
 * headline text so engine-authored points actually reach the portal.
 */
export const extractEnginePointText = (v: Any): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return pickString(v);
  if (typeof v === "object") {
    return (
      pickString(v.key_diagnosis) ??
      pickString(v.diagnosis) ??
      pickString(v["24_month_destination"]) ??
      pickString(v.destination) ??
      pickString(v.summary) ??
      pickString(v.detail) ??
      null
    );
  }
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

// ─── Canvas normalization ────────────────────────────────────────────────

const slugify = (input: string, seed: number): string => {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  return base || `item-${seed}`;
};

const normalizeStatus = (raw: Any): CanvasItemStatus => {
  const s = String(raw ?? "").toLowerCase();
  if (s === "completed" || s === "done") return "completed";
  if (s === "in_progress" || s === "active") return "in_progress";
  if (s === "blocked") return "blocked";
  if (s === "optional" || s === "future") return "optional";
  return "upcoming";
};

const normalizePriority = (raw: Any): CanvasItemPriority => {
  const s = String(raw ?? "").toLowerCase();
  if (s === "high" || s === "p0" || s === "critical") return "high";
  if (s === "medium" || s === "p1" || s === "normal") return "medium";
  if (s === "low" || s === "p2") return "low";
  return null;
};
type CanvasItemPriority = "high" | "medium" | "low" | null;

const normalizeType = (raw: Any, fallback: CanvasItemType): CanvasItemType => {
  const s = String(raw ?? "").toLowerCase();
  if (s === "milestone") return "milestone";
  if (s === "decision") return "decision";
  if (s === "deliverable") return "deliverable";
  if (s === "deadline") return "deadline";
  if (s === "client_action" || s === "action" || s === "clientaction") return "client_action";
  if (s === "meeting") return "meeting";
  return fallback;
};

const normalizeStrings = (v: Any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x.trim();
        if (x && typeof x === "object") return pickString(x.title) ?? pickString(x.name) ?? "";
        return String(x ?? "").trim();
      })
      .filter(Boolean);
  }
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  return [];
};

const normalizeFiles = (v: Any): ClientSafeCanvasItem["relatedFiles"] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((f: Any) => {
      if (typeof f === "string") return { label: f };
      if (f && typeof f === "object") {
        const label = pickString(f.label) ?? pickString(f.name) ?? pickString(f.title);
        if (!label) return null;
        const url = pickString(f.url) ?? undefined;
        const fileId = pickString(f.fileId) ?? pickString(f.file_id) ?? undefined;
        return { label, url, fileId };
      }
      return null;
    })
    .filter((x): x is { label: string; url?: string; fileId?: string } => !!x);
};

const normalizeItem = (
  raw: Any,
  fallbackType: CanvasItemType,
  index: number,
  usedIds: Set<string>,
): ClientSafeCanvasItem | null => {
  if (!raw) return null;
  const obj: Any = typeof raw === "string" ? { title: raw } : raw;
  const title = pickString(obj.title) ?? pickString(obj.name) ?? pickString(obj.label);
  if (!title) return null;
  let id = pickString(obj.id) ?? pickString(obj.slug) ?? slugify(title, index);
  let attempt = 1;
  while (usedIds.has(id)) id = `${id}-${++attempt}`;
  usedIds.add(id);

  return {
    id,
    title,
    type: normalizeType(obj.type ?? obj.kind, fallbackType),
    status: normalizeStatus(obj.status),
    phaseId: pickString(obj.phaseId) ?? pickString(obj.phase_id) ?? pickString(obj.phase),
    sequence: typeof obj.sequence === "number" ? obj.sequence : index,
    priority: normalizePriority(obj.priority),
    clientSafeDescription:
      pickString(obj.clientSafeDescription) ??
      pickString(obj.client_safe_description) ??
      pickString(obj.description) ??
      pickString(obj.summary) ??
      null,
    whyItMatters:
      pickString(obj.whyItMatters) ??
      pickString(obj.why_it_matters) ??
      pickString(obj.why) ??
      null,
    whatItUnlocks: normalizeStrings(
      obj.whatItUnlocks ?? obj.what_it_unlocks ?? obj.unlocks ?? obj.enables,
    ),
    targetDate:
      pickString(obj.targetDate) ??
      pickString(obj.target_date) ??
      pickString(obj.dueDate) ??
      pickString(obj.due_date) ??
      null,
    relatedFiles: normalizeFiles(obj.relatedFiles ?? obj.related_files ?? obj.files),
    actionNeeded:
      pickString(obj.actionNeeded) ??
      pickString(obj.action_needed) ??
      pickString(obj.clientActionNeeded) ??
      pickString(obj.client_action_needed) ??
      null,
  };
};

const normalizePhases = (v: Any): ClientSafeCanvasPhase[] => {
  if (!Array.isArray(v)) return [];
  const used = new Set<string>();
  return v
    .map((p: Any, i: number) => {
      if (!p || typeof p !== "object") return null;
      const label = pickString(p.label) ?? pickString(p.name) ?? pickString(p.title);
      if (!label) return null;
      let id = pickString(p.id) ?? pickString(p.slug) ?? slugify(label, i);
      let attempt = 1;
      while (used.has(id)) id = `${id}-${++attempt}`;
      used.add(id);
      return {
        id,
        label,
        timeframe: pickString(p.timeframe) ?? pickString(p.window) ?? null,
        summary: pickString(p.summary) ?? pickString(p.description) ?? null,
        sequence: typeof p.sequence === "number" ? p.sequence : i,
      };
    })
    .filter((x): x is ClientSafeCanvasPhase => !!x);
};

const normalizeItems = (
  v: Any,
  fallbackType: CanvasItemType,
): ClientSafeCanvasItem[] => {
  if (!Array.isArray(v)) return [];
  const used = new Set<string>();
  return v
    .map((it, i) => normalizeItem(it, fallbackType, i, used))
    .filter((x): x is ClientSafeCanvasItem => !!x)
    .map((x) => ({ ...x, type: x.type })); // preserve normalized type
};

/**
 * Derive phases + a flat item list from the legacy `sequence_30_60_90`
 * shape when the operator-curated canvas is missing. This keeps every
 * published roadmap producing a non-empty `client_safe_canvas` so the
 * portal never falls back further than one hop.
 */
const canvasFromSequence = (
  seq: ClientSafeRoadmap["sequence_30_60_90"],
  priorities: ClientSafeRoadmap["strategic_priorities"],
): { phases: ClientSafeCanvasPhase[]; milestones: ClientSafeCanvasItem[] } => {
  const phaseDefs: Array<{ id: string; label: string; timeframe: string; key: "30" | "60" | "90" }> = [
    { id: "now", label: "Now", timeframe: "First 30 days", key: "30" },
    { id: "next", label: "Next", timeframe: "Days 31–60", key: "60" },
    { id: "later", label: "Later", timeframe: "Days 61–90", key: "90" },
  ];
  const phases: ClientSafeCanvasPhase[] = phaseDefs.map((p, i) => ({
    id: p.id,
    label: p.label,
    timeframe: p.timeframe,
    summary: null,
    sequence: i,
  }));
  const used = new Set<string>();
  const milestones: ClientSafeCanvasItem[] = [];
  let idx = 0;
  for (const def of phaseDefs) {
    const items = seq[def.key] ?? [];
    for (const title of items) {
      const item = normalizeItem({ title, type: "milestone" }, "milestone", idx, used);
      if (!item) continue;
      item.phaseId = def.id;
      item.sequence = idx;
      milestones.push(item);
      idx++;
    }
  }
  // If sequence buckets were empty, seed the first phase from strategic
  // priorities so the canvas is not blank.
  if (milestones.length === 0 && priorities.length > 0) {
    for (const p of priorities) {
      const item = normalizeItem(
        { title: p.title, description: p.detail, type: "milestone" },
        "milestone",
        idx,
        used,
      );
      if (!item) continue;
      item.phaseId = "now";
      item.sequence = idx;
      milestones.push(item);
      idx++;
    }
  }
  return { phases, milestones };
};

const buildClientSafeCanvas = (
  src: Any,
  fallback: {
    pointA: { authored: string | null; derived: string | null };
    pointB: { authored: string | null; derived: string | null };
    sequence: ClientSafeRoadmap["sequence_30_60_90"];
    priorities: ClientSafeRoadmap["strategic_priorities"];
  },
): ClientSafeCanvas => {
  const canvas: Any =
    src && typeof src === "object" && src.client_safe_canvas && typeof src.client_safe_canvas === "object"
      ? src.client_safe_canvas
      : src && typeof src === "object" && src.canvas && typeof src.canvas === "object"
        ? src.canvas
        : null;

  // Precedence: the live engine-authored field beats a canvas value embedded
  // in the version payload (which can be stale), which beats derived filler.
  // Labels are real when authored on the canvas; otherwise a neutral default.
  const canvasPointADetail =
    pickString(canvas?.pointA?.detail) ??
    pickString(canvas?.point_a?.detail) ??
    pickString(canvas?.pointA);
  const pointADetail = fallback.pointA.authored ?? canvasPointADetail ?? fallback.pointA.derived;
  const pointA: ClientSafeCanvasPoint = {
    label:
      pickString(canvas?.pointA?.label) ?? pickString(canvas?.point_a?.label) ?? "Current state",
    detail: pointADetail,
    source:
      fallback.pointA.authored != null || canvasPointADetail != null ? "authored" : "fallback",
  };
  const canvasPointBDetail =
    pickString(canvas?.pointB?.detail) ??
    pickString(canvas?.point_b?.detail) ??
    pickString(canvas?.pointB);
  const pointBDetail = fallback.pointB.authored ?? canvasPointBDetail ?? fallback.pointB.derived;
  const pointB: ClientSafeCanvasPoint = {
    label: pickString(canvas?.pointB?.label) ?? pickString(canvas?.point_b?.label) ?? "Destination",
    detail: pointBDetail,
    source:
      fallback.pointB.authored != null || canvasPointBDetail != null ? "authored" : "fallback",
  };

  let phases = normalizePhases(canvas?.phases);
  let milestones = normalizeItems(canvas?.milestones, "milestone");
  const decisions = normalizeItems(canvas?.decisions, "decision").map((x) => ({ ...x, type: "decision" as const }));
  const deliverables = normalizeItems(canvas?.deliverables, "deliverable").map((x) => ({ ...x, type: "deliverable" as const }));
  const deadlines = normalizeItems(canvas?.deadlines, "deadline").map((x) => ({ ...x, type: "deadline" as const }));
  const clientActions = normalizeItems(
    canvas?.clientActions ?? canvas?.client_actions,
    "client_action",
  ).map((x) => ({ ...x, type: "client_action" as const }));

  if (phases.length === 0 && milestones.length === 0) {
    const derived = canvasFromSequence(fallback.sequence, fallback.priorities);
    phases = derived.phases;
    milestones = derived.milestones;
  } else if (phases.length === 0) {
    // Derive phase list from milestone.phaseId values.
    const seen = new Set<string>();
    phases = milestones
      .map((m, i) => ({ id: m.phaseId ?? `phase-${i}`, i }))
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p, i) => ({
        id: p.id,
        label: p.id.charAt(0).toUpperCase() + p.id.slice(1),
        timeframe: null,
        summary: null,
        sequence: i,
      }));
  }

  return {
    pointA,
    pointB,
    phases,
    milestones,
    decisions,
    deliverables,
    deadlines,
    clientActions,
  };
};

export function buildClientSafePayload(input: {
  version_label: string;
  title: string;
  payload: Any;
  client_preview_override?: Any;
  /**
   * Authoritative Point A / Point B from engine_projects. Accepts the raw
   * jsonb module (or a plain string) — the headline text is extracted via
   * extractEnginePointText. When present these override BOTH payload-canvas
   * values and derived fallbacks so the portal canvas always renders the
   * engine-authored fields — the biggest brand fidelity gap in the portal.
   */
  project_point_a?: Any;
  project_point_b?: Any;
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

  const executive_summary =
    pickString(src.executive_summary) ??
    pickString(src.summary) ??
    pickString(blueprint.summary) ??
    null;
  const current_diagnosis =
    pickString(src.current_diagnosis) ??
    pickString(pointA.diagnosis) ??
    pickString(pointA.summary) ??
    null;
  const strategic_priorities = pickPriorities(
    src.strategic_priorities ?? blueprint.priorities ?? roadmap.priorities,
  );
  const sequence_30_60_90 = pickSequence(src.sequence_30_60_90 ?? src.sequence);
  const risks_dependencies = pickRisks(src.risks_dependencies ?? src.risks);
  const recommended_next_move =
    pickString(src.recommended_next_move) ??
    pickString(src.next_move) ??
    null;
  const supporting_notes =
    pickString(src.supporting_notes) ?? pickString(src.client_notes) ?? null;

  const client_safe_canvas = buildClientSafeCanvas(src, {
    // The engine-authored Point A / Point B are the map, not decorative —
    // they win over payload-canvas values and derived diagnosis / summary.
    // `authored` vs `derived` also drives the source tag on each point.
    pointA: {
      authored: extractEnginePointText(input.project_point_a),
      derived: current_diagnosis,
    },
    pointB: {
      authored: extractEnginePointText(input.project_point_b),
      derived: executive_summary,
    },
    sequence: sequence_30_60_90,
    priorities: strategic_priorities,
  });

  const out: ClientSafeRoadmap = {
    title: input.title,
    version_label: input.version_label,
    executive_summary,
    current_diagnosis,
    strategic_priorities,
    sequence_30_60_90,
    risks_dependencies,
    recommended_next_move,
    supporting_notes,
    client_safe_canvas,
  };

  // Runtime allowlist guard — belt-and-suspenders against future refactors
  // that accidentally spread internal fields onto the client payload.
  // Pillar 8: STRIP unknown keys before returning (previously only logged).
  const extra = Object.keys(out).filter(
    (k) => !CLIENT_SAFE_KEYS.includes(k as (typeof CLIENT_SAFE_KEYS)[number]),
  );
  if (extra.length) {
    const msg = `buildClientSafePayload: non-allowlisted keys detected: ${extra.join(", ")}`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    // eslint-disable-next-line no-console
    console.error(msg);
    for (const k of extra) delete (out as Record<string, unknown>)[k];
  }
  // Also hard-project via the allowlist so any accidental prototype/hidden
  // props never reach the wire.
  const projected = {} as ClientSafeRoadmap;
  for (const k of CLIENT_SAFE_KEYS) {
    (projected as Record<string, unknown>)[k] = (out as Record<string, unknown>)[k];
  }
  return projected;
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
  "client_safe_canvas",
] as const;
