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
 * Priority tier used by the "smart map" density model.
 *  1 — always visible (strategic anchors, current phase milestones, deadlines)
 *  2 — primary items in the focus phase (decisions, active deliverables)
 *  3 — supporting items (meetings, secondary deliverables, distant phases)
 */
function priorityLevel(
  m: RoadmapMilestone,
  journey: RoadmapJourney,
  currentPhaseKey: string,
): 1 | 2 | 3 {
  if (isStrategicAnchor(m, journey)) return 1;
  if (m.dueDate && m.status !== "completed") return 1;
  // Current phase milestones are always visible (Level 1)
  if (m.phase === currentPhaseKey && m.kind === "milestone") return 1;
  if (m.phase === currentPhaseKey) {
    if (m.kind === "decision") return 2;
    if (m.kind === "deliverable" && m.status !== "completed") return 2;
  }
  // Selected phase primary items
  return 3;
}

/**
 * Compute how a single marker should render. Combines information zoom,
 * view-mode filter, legend toggles, and priority-tier gating so density
 * scales with the client's active lens.
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
  const level = priorityLevel(m, journey, currentPhaseKey);
  const kind = kindKey(m);
  const inFocusPhase = m.phase === focusPhase;
  const inCurrentPhase = m.phase === currentPhaseKey;
  const nearFocusPhase = phaseIsNear(m.phase, focusPhase, journey);
  const onCriticalPath = journey.criticalPathSlugs.includes(m.slug);

  // Legend gating first — hidden wins over anchor promotion for supporting kinds.
  const legendVisible = visibleKinds.has(kind);
  const legendMuted = mutedKinds.has(kind);
  const legendHidden = !legendVisible && !legendMuted;
  if (legendHidden && !anchor) return "hidden";

  // View-mode density model — each mode changes what the client sees.
  switch (mode) {
    case "all": {
      // Full Journey: only the strategic anchors get full labels. Everything
      // else compacts to an icon (or hides at strategic zoom) so no single
      // phase — especially Phase 1 — turns into a wall of pills.
      if (anchor) return "full";
      if (m.dueDate && m.status !== "completed") return "full";
      if (m.kind === "meeting")
        return zoom === "strategic" ? "hidden" : "icon";
      if (m.kind === "deliverable")
        return zoom === "strategic" ? "hidden" : "icon";
      if (m.kind === "decision") {
        // Show decision short labels only when the user has explicitly
        // focused that phase — keeps Full Journey calm by default.
        if (selectedPhaseKey && inFocusPhase) return "short";
        return "icon";
      }
      // Milestones: short label only when the user has focused this phase.
      if (selectedPhaseKey && inFocusPhase) return "short";
      return zoom === "strategic" ? "icon" : "icon";
    }

    case "current": {
      // Current Phase: rich detail inside the focus phase, dim everything else.
      if (inFocusPhase) {
        if (level <= 2) return anchor ? "full" : "short";
        return "icon";
      }
      if (anchor) return "muted";
      return "muted";
    }

    case "client-actions": {
      // What needs me: only client action items, decisions, and upcoming meetings.
      const isMineAction = !!m.clientActionNeeded;
      const isDecision = m.kind === "decision";
      const isUpcomingMeeting =
        m.kind === "meeting" && m.status !== "completed";
      if (!isMineAction && !isDecision && !isUpcomingMeeting && !anchor) {
        return "hidden";
      }
      if (anchor || isMineAction) return "full";
      return "short";
    }

    case "critical-path": {
      if (onCriticalPath || anchor) return anchor ? "full" : "short";
      return "muted";
    }

    case "deliverables": {
      // Deliverables + the milestone they support (same phase) stay visible.
      if (m.kind === "deliverable") return "full";
      if (anchor) return "full";
      if (m.kind === "milestone" && inCurrentPhase) return "short";
      return "muted";
    }

    case "deadlines": {
      // Deadline flags + items tied to them (critical path, related decisions).
      const isDeadline = !!m.dueDate;
      if (isDeadline) return "full";
      if (anchor) return "full";
      if (onCriticalPath) return "short";
      if (m.kind === "decision" && inCurrentPhase) return "short";
      return "muted";
    }

    case "decisions": {
      if (m.kind !== "decision" && !anchor) return "hidden";
      return anchor ? "full" : "short";
    }
  }

  // Fallback (shouldn't be reached) — zoom-driven density.
  if (zoom === "strategic") {
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
