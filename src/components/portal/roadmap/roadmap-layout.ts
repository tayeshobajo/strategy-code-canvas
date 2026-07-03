import type {
  RoadmapJourney,
  RoadmapMilestone,
  PhaseKey,
} from "@/lib/portal-roadmap-model";

export type MarkerPos = {
  milestone: RoadmapMilestone;
  /** normalized 0..1 x within the canvas */
  nx: number;
  /** normalized 0..1 y within the canvas */
  ny: number;
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
      // Ease-in-out along the phase band, with a gentle vertical wobble so
      // markers don't sit on a perfect line.
      const nx = layout.x0 + (layout.x1 - layout.x0) * t;
      const baseY = layout.yStart + (layout.yEnd - layout.yStart) * t;
      const wobble = Math.sin(t * Math.PI) * 0.045;
      const ny = baseY - wobble;
      markers.push({ milestone: m, nx, ny });
    });
  }
  return { markers, bands };
}
