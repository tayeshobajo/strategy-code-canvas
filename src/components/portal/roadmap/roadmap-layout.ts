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

/**
 * Build a smooth Catmull-Rom-through-points path (converted to cubic Béziers)
 * so the spine reads as one continuous journey and per-phase segments join
 * seamlessly. Points are in canvas-space (already scaled).
 */
function catmullRomPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.5; // tension: 0.5 = classic Catmull-Rom
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export type PhaseSpineSegment = {
  key: PhaseKey;
  /** SVG "d" string for just this phase segment (starts where prev ends). */
  d: string;
  /** first / last on-road anchor points on this segment, in canvas-space */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

/** Deterministic marker layout for the map canvas. */
export function computeMapLayout(journey: RoadmapJourney): {
  markers: MarkerPos[];
  bands: PhaseBand[];
  /** Smooth spine path from Point A through phase anchors to Point B. */
  spineD: string;
  /** Per-phase spine segments, so the current phase can shimmer. */
  spineSegments: PhaseSpineSegment[];
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
  // Per-phase on-road anchor points, in normalized (nx, ny) space, so we can
  // build a coherent spine and route adjacent/fork markers off of it.
  const phaseAnchors: Array<{ key: PhaseKey; nx: number; ny: number }[]> = [];

  for (const phase of journey.phases) {
    const layout = PHASE_LAYOUT[phase.key];
    const items = phase.milestones;
    const n = items.length;
    // Inset the marker band inside each phase so items don't hug the borders
    // and adjacent phases don't collide at their shared edge.
    const inset = Math.min(0.045, (layout.x1 - layout.x0) * 0.12);
    const x0 = layout.x0 + inset;
    const x1 = layout.x1 - inset;
    const minGap = 0.052;
    const span = Math.max(x1 - x0, (n - 1) * minGap);
    const start = x0 - Math.max(0, (span - (x1 - x0)) / 2);
    const anchors: { key: PhaseKey; nx: number; ny: number }[] = [];
    items.forEach((m, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const nx = n === 1 ? (x0 + x1) / 2 : start + span * t;
      // On-road baseline: smooth arc across the phase between yStart and yEnd.
      const baseY = layout.yStart + (layout.yEnd - layout.yStart) * t;
      const attachment = attachmentForKind(m);
      const offset = attachmentOffset(attachment);
      // Alternating micro-offset only for adjacent/off-road/fork so on-road
      // markers stay glued to the spine (no more stagger jitter).
      const stagger =
        attachment === "on-road" || attachment === "flag"
          ? 0
          : (i % 2 === 0 ? -1 : 1) * 0.012;
      const ny = baseY + offset + stagger;
      markers.push({ milestone: m, nx, ny, attachment });
      // The anchor for the spine is the ON-ROAD position (offset stripped).
      anchors.push({ key: phase.key, nx, ny: baseY });
    });
    phaseAnchors.push(anchors);
  }

  // Build per-phase spine segments + full spine "d".
  // Include Point A at the head and Point B at the tail so the spine reads as
  // a single continuous journey from start to destination.
  const cw = 1; // work in normalized space, callers multiply by CANVAS_WIDTH.
  const ch = 1;
  const flatAnchors: Array<{ x: number; y: number; phase?: PhaseKey }> = [];
  flatAnchors.push({ x: POINT_A_POS.nx * cw, y: POINT_A_POS.ny * ch });
  for (let pi = 0; pi < phaseAnchors.length; pi++) {
    for (const a of phaseAnchors[pi]) {
      flatAnchors.push({ x: a.nx * cw, y: a.ny * ch, phase: a.key });
    }
  }
  flatAnchors.push({ x: POINT_B_POS.nx * cw, y: POINT_B_POS.ny * ch });

  const spineD = catmullRomPath(flatAnchors);

  // Per-phase segments: slice the anchor array by phase key.
  const spineSegments: PhaseSpineSegment[] = journey.phases.map((phase, pi) => {
    const anchors = phaseAnchors[pi];
    const prevPhaseTail =
      pi > 0
        ? phaseAnchors[pi - 1][phaseAnchors[pi - 1].length - 1]
        : { key: phase.key, nx: POINT_A_POS.nx, ny: POINT_A_POS.ny };
    const nextPhaseHead =
      pi < phaseAnchors.length - 1
        ? phaseAnchors[pi + 1][0]
        : { key: phase.key, nx: POINT_B_POS.nx, ny: POINT_B_POS.ny };
    const segPts = [
      { x: prevPhaseTail.nx, y: prevPhaseTail.ny },
      ...anchors.map((a) => ({ x: a.nx, y: a.ny })),
      { x: nextPhaseHead.nx, y: nextPhaseHead.ny },
    ];
    const first = anchors[0] ?? { nx: prevPhaseTail.nx, ny: prevPhaseTail.ny };
    const last =
      anchors[anchors.length - 1] ?? {
        nx: nextPhaseHead.nx,
        ny: nextPhaseHead.ny,
      };
    return {
      key: phase.key,
      d: catmullRomPath(segPts),
      startX: first.nx,
      startY: first.ny,
      endX: last.nx,
      endY: last.ny,
    };
  });

  return { markers, bands, spineD, spineSegments };
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
