import type {
  MilestoneKind,
  RoadmapJourney,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";

export type RoadmapViewMode =
  | "all"
  | "decisions"
  | "deliverables"
  | "deadlines"
  | "current"
  | "client-actions"
  | "critical-path";

export const VIEW_MODE_LABEL: Record<RoadmapViewMode, string> = {
  all: "Full journey",
  decisions: "Decisions only",
  deliverables: "Deliverables only",
  deadlines: "Deadlines only",
  current: "Current phase",
  "client-actions": "What needs me",
  "critical-path": "Critical path",
};

/** How a marker should be rendered on the canvas. */
export type MarkerVisibility = "full" | "short" | "icon" | "muted" | "hidden";

/** Which "kinds" are visible via the interactive legend. */
export type LegendKind = MilestoneKind | "deadline";

export const DEFAULT_VISIBLE_KINDS: Set<LegendKind> = new Set<LegendKind>([
  "milestone",
  "decision",
  "deadline",
]);

export const DEFAULT_MUTED_KINDS: Set<LegendKind> = new Set<LegendKind>([
  "meeting",
  "deliverable",
]);

/** Information zoom, driving how much detail the map surfaces at once. */
export type ZoomLevel = "strategic" | "phase" | "detail";

export type VisibilityInputs = {
  mode: RoadmapViewMode;
  zoom: ZoomLevel;
  journey: RoadmapJourney;
  currentPhaseKey: string;
  selectedPhaseKey: string | null;
  visibleKinds: Set<LegendKind>;
  mutedKinds: Set<LegendKind>;
  selectedSlug: string | null;
};

function isStrategicAnchor(m: RoadmapMilestone, journey: RoadmapJourney): boolean {
  if (m.slug === journey.activeMilestone?.slug) return true;
  if (m.slug === journey.nextDecisionSlug) return true;
  if (m.slug === journey.nextDeadlineSlug) return true;
  return false;
}

function phaseIsNear(
  phase: string,
  focus: string,
  journey: RoadmapJourney,
): boolean {
  if (phase === focus) return true;
  const order: string[] = journey.phases.map((p) => p.key);
  const a = order.indexOf(phase);
  const b = order.indexOf(focus);
  if (a < 0 || b < 0) return false;
  return Math.abs(a - b) === 1;
}

function kindKey(m: RoadmapMilestone): LegendKind {
  if (m.dueDate && m.kind === "milestone") return "deadline";
  return m.kind;
}

/**
 * Compute how a single marker should render. Combines information zoom,
 * view-mode filter, legend toggles, and strategic-anchor promotion.
 */
export function computeMarkerVisibility(
  m: RoadmapMilestone,
  input: VisibilityInputs,
): MarkerVisibility {
  const {
    mode,
    zoom,
    journey,
    currentPhaseKey,
    selectedPhaseKey,
    visibleKinds,
    mutedKinds,
    selectedSlug,
  } = input;

  // Selected marker is always full.
  if (selectedSlug && m.slug === selectedSlug) return "full";

  const focusPhase = selectedPhaseKey ?? currentPhaseKey;
  const anchor = isStrategicAnchor(m, journey);
  const kind = kindKey(m);
  const inFocusPhase = m.phase === focusPhase;
  const nearFocusPhase = phaseIsNear(m.phase, focusPhase, journey);

  // Legend gating first — hidden wins over anchor promotion for supporting kinds.
  // Anchors of kind "milestone"/"decision"/"deadline" are always visible.
  const legendVisible = visibleKinds.has(kind);
  const legendMuted = mutedKinds.has(kind);
  const legendHidden = !legendVisible && !legendMuted;
  if (legendHidden && !anchor) return "hidden";

  // View-mode filter.
  switch (mode) {
    case "decisions":
      if (m.kind !== "decision" && !anchor) return "hidden";
      break;
    case "deliverables":
      if (m.kind !== "deliverable" && !anchor) return "hidden";
      break;
    case "deadlines":
      if (!(m.dueDate || journey.criticalPathSlugs.includes(m.slug))) {
        if (!anchor) return "hidden";
      }
      break;
    case "current":
      if (m.phase !== currentPhaseKey && !anchor) return "hidden";
      break;
    case "client-actions":
      if (!m.clientActionNeeded && m.kind !== "decision" && !anchor) {
        return "hidden";
      }
      break;
    case "all":
    default:
      break;
  }

  // Information zoom drives density.
  if (zoom === "strategic") {
    // Only Level 1 (anchors + point-adjacent items) show full labels.
    if (anchor) return "full";
    if (inFocusPhase && m.kind === "milestone") return "short";
    return "icon";
  }
  if (zoom === "phase") {
    if (anchor) return "full";
    if (inFocusPhase) return "short";
    if (nearFocusPhase) return "icon";
    return legendMuted ? "muted" : "icon";
  }
  // detail zoom
  if (anchor) return "full";
  if (inFocusPhase) return "short";
  if (legendMuted && !anchor && !inFocusPhase) return "muted";
  return "short";
}

/** Convenience for the sheet — is a marker even rendered right now? */
export function isRendered(v: MarkerVisibility): boolean {
  return v !== "hidden";
}

/**
 * Legacy helper for surfaces (e.g. the mobile phase stack) that only need
 * "which slugs are shown right now". Uses default zoom = strategic and
 * default legend toggles.
 */
export function computeMatchingSlugs(
  journey: RoadmapJourney,
  mode: RoadmapViewMode,
): Set<string> {
  const set = new Set<string>();
  const visible = DEFAULT_VISIBLE_KINDS;
  const muted = DEFAULT_MUTED_KINDS;
  for (const m of journey.milestones) {
    const v = computeMarkerVisibility(m, {
      mode,
      zoom: "detail",
      journey,
      currentPhaseKey: journey.currentPhaseKey,
      selectedPhaseKey: null,
      visibleKinds: visible,
      mutedKinds: muted,
      selectedSlug: null,
    });
    if (v !== "hidden") set.add(m.slug);
  }
  return set;
}

