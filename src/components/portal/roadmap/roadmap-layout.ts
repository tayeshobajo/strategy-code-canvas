import type {
  RoadmapJourney,
  RoadmapMilestone,
  MilestoneKind,
  PhaseKey,
} from "@/lib/portal-roadmap-model";

export type MarkerAttachment = "on-road" | "fork" | "beside" | "flag" | "off-road";

export type MarkerPos = {
  milestone: RoadmapMilestone;
  /** normalized 0..1 x within the canvas */
  nx: number;
  /** normalized 0..1 y within the canvas */
  ny: number;
  /** how this marker relates to the road */
  attachment: MarkerAttachment;
};

export type PhaseBand = {
  key: PhaseKey;
  label: string;
  timeframe: string;
  /** normalized x range on the canvas */
  x0: number;
  x1: number;
  /** normalized y for the phase heading */
  headingY: number;
  /** 0..1 completion ratio for the pill */
  completionRatio: number;
};

// Terrain-tuned per-phase layout tuples for the map background:
//   Phase 1 sits in the lower-left valley,
//   Phase 2 crosses the mid plateau,
//   Phase 3 climbs the right-hand ridge to the peak.
const PHASE_LAYOUT: Record<
  PhaseKey,
  { x0: number; x1: number; yStart: number; yEnd: number; headingY: number }
> = {
  now: { x0: 0.16, x1: 0.4, yStart: 0.72, yEnd: 0.58, headingY: 0.32 },
  next: { x0: 0.4, x1: 0.64, yStart: 0.52, yEnd: 0.38, headingY: 0.24 },
  later: { x0: 0.64, x1: 0.9, yStart: 0.4, yEnd: 0.22, headingY: 0.18 },
};

export const POINT_A_POS = { nx: 0.09, ny: 0.86 };
export const POINT_B_POS = { nx: 0.94, ny: 0.13 };

/** Marker placement rule → default attachment for each kind. */
export function attachmentForKind(m: RoadmapMilestone): MarkerAttachment {
  if (m.kind === "decision") return "fork";
  if (m.kind === "deliverable") return "beside";
  if (m.kind === "meeting") return "off-road";
  if (m.dueDate) return "flag";
  return "on-road";
}

/** Perpendicular offset (in normalized-y) applied by attachment type. */
function attachmentOffset(a: MarkerAttachment): number {
  switch (a) {
    case "fork":
      return -0.045;
    case "beside":
      return 0.05;
    case "off-road":
      return 0.09;
    case "flag":
      return -0.02;
    case "on-road":
    default:
      return 0;
  }
}

/** Deterministic marker layout for the map canvas. */
export function computeMapLayout(journey: RoadmapJourney): {
  markers: MarkerPos[];
  bands: PhaseBand[];
} {
  const bands: PhaseBand[] = journey.phases.map((p, i) => {
    const layout = PHASE_LAYOUT[p.key];
    const real = p.milestones.filter((m) => !m.slug.endsWith("-placeholder"));
    const done = real.filter((m) => m.status === "completed").length;
    const active = real.filter((m) => m.status === "in_progress").length;
    const total = real.length || 1;
    const ratio = Math.min(1, (done + active * 0.5) / total);
    return {
      key: p.key,
      label: `${i + 1}`,
      timeframe: p.timeframe,
      x0: layout.x0,
      x1: layout.x1,
      headingY: layout.headingY,
      completionRatio: ratio,
    };
  });

  const markers: MarkerPos[] = [];
  for (const phase of journey.phases) {
    const layout = PHASE_LAYOUT[phase.key];
    const items = phase.milestones;
    const n = items.length;
    items.forEach((m, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const nx = layout.x0 + (layout.x1 - layout.x0) * t;
      const baseY = layout.yStart + (layout.yEnd - layout.yStart) * t;
      const wobble = Math.sin(t * Math.PI) * 0.045;
      const attachment = attachmentForKind(m);
      const ny = baseY - wobble + attachmentOffset(attachment);
      markers.push({ milestone: m, nx, ny, attachment });
    });
  }
  return { markers, bands };
}

/** Return the horizontal viewport bounds (nx0..nx1) for a given target. */
export function targetBounds(
  journey: RoadmapJourney,
  target: "pointA" | "pointB" | PhaseKey,
): { center: number; nx0: number; nx1: number } {
  if (target === "pointA") {
    return { center: POINT_A_POS.nx, nx0: 0, nx1: 0.2 };
  }
  if (target === "pointB") {
    return { center: POINT_B_POS.nx, nx0: 0.82, nx1: 1 };
  }
  const layout = PHASE_LAYOUT[target as PhaseKey];
  return {
    center: (layout.x0 + layout.x1) / 2,
    nx0: layout.x0,
    nx1: layout.x1,
  };
}

export type MarkerCluster = {
  key: string;
  phase: PhaseKey;
  nx: number;
  ny: number;
  members: MarkerPos[];
  total: number;
  completed: number;
  inProgress: number;
  decisions: number;
  deadlines: number;
  meetings: number;
};

export type ClusterOrMarker =
  | { kind: "marker"; pos: MarkerPos }
  | { kind: "cluster"; cluster: MarkerCluster };

/**
 * Group markers that would render inside the same tight neighborhood at the
 * given zoom level. Simple approach: bucket by phase + row when zoomed out.
 *
 * `keepFull` slugs (Level 1 anchors) are never absorbed into clusters.
 */
export function clusterMarkers(
  markers: MarkerPos[],
  opts: { thresholdNx: number; keepFull: Set<string> },
): ClusterOrMarker[] {
  const { thresholdNx, keepFull } = opts;
  if (thresholdNx <= 0) return markers.map((pos) => ({ kind: "marker", pos }));

  const out: ClusterOrMarker[] = [];
  const consumed = new Set<number>();

  markers.forEach((pos, i) => {
    if (consumed.has(i)) return;
    if (keepFull.has(pos.milestone.slug)) {
      out.push({ kind: "marker", pos });
      return;
    }
    // Look ahead for cluster members within the threshold in the same phase.
    const group: MarkerPos[] = [pos];
    const indexes: number[] = [i];
    for (let j = i + 1; j < markers.length; j++) {
      if (consumed.has(j)) continue;
      const other = markers[j];
      if (other.milestone.phase !== pos.milestone.phase) continue;
      if (keepFull.has(other.milestone.slug)) continue;
      const dx = Math.abs(other.nx - pos.nx);
      const dy = Math.abs(other.ny - pos.ny);
      if (dx < thresholdNx && dy < thresholdNx * 0.8) {
        group.push(other);
        indexes.push(j);
      }
    }
    if (group.length < 2) {
      out.push({ kind: "marker", pos });
      return;
    }
    indexes.forEach((idx) => consumed.add(idx));
    const nx = group.reduce((s, g) => s + g.nx, 0) / group.length;
    const ny = group.reduce((s, g) => s + g.ny, 0) / group.length;
    const completed = group.filter((g) => g.milestone.status === "completed").length;
    const inProgress = group.filter((g) => g.milestone.status === "in_progress").length;
    const decisions = group.filter((g) => g.milestone.kind === "decision").length;
    const deadlines = group.filter((g) => g.milestone.dueDate).length;
    const meetings = group.filter((g) => g.milestone.kind === "meeting").length;
    out.push({
      kind: "cluster",
      cluster: {
        key: `cluster-${pos.milestone.phase}-${indexes.join("-")}`,
        phase: pos.milestone.phase,
        nx,
        ny,
        members: group,
        total: group.length,
        completed,
        inProgress,
        decisions,
        deadlines,
        meetings,
      },
    });
  });

  return out;
}

/** Convenience — filter markers to a set of kinds (used for legend previews). */
export function filterMarkersByKind(
  markers: MarkerPos[],
  kinds: Set<MilestoneKind>,
): MarkerPos[] {
  return markers.filter((m) => kinds.has(m.milestone.kind));
}
