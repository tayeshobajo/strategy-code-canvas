/**
 * Roadmap Studio — pure structured-layout helper.
 *
 * Given phases + milestones from the existing RoadmapView, compute React
 * Flow node positions for Point A, phase headers, milestone cards, and
 * Point B. No React, no DB. The Studio owns visual state; milestone
 * truth stays in engine_milestones.
 */

import type { RoadmapPhase, RoadmapMilestoneView } from "@/lib/roadmap-view";

export const STUDIO_LAYOUT: {
  cardW: number; cardH: number; cardGapY: number;
  colGapX: number; colW: number;
  laneTop: number; laneHeaderH: number;
  pointW: number; pointH: number;
  originX: number; originY: number;
} = {
  cardW: 220,
  cardH: 130,
  cardGapY: 18,
  colGapX: 40,
  colW: 244,
  laneTop: 220,
  laneHeaderH: 70,
  pointW: 190,
  pointH: 170,
  originX: 40,
  originY: 60,
};

export type StudioNodeKind = "pointA" | "pointB" | "phaseHeader" | "milestone";

export type StudioPosition = { x: number; y: number };

export type StudioComputedLayout = {
  positions: Record<string, StudioPosition>;
  phaseOrder: string[];
  milestonesByPhase: Record<string, string[]>;
  pointAId: string;
  pointBId: string;
  laneBottom: number;
  canvasRight: number;
};

/** Deterministic hue per phase index. Reused across nodes + edges. */
export const STUDIO_PHASE_PALETTE = [
  { key: "slate",   ring: "oklch(0.55 0.03 260)",  soft: "oklch(0.97 0.01 260)", edge: "oklch(0.58 0.04 260)" },
  { key: "teal",    ring: "oklch(0.60 0.11 190)",  soft: "oklch(0.97 0.03 190)", edge: "oklch(0.60 0.12 190)" },
  { key: "royal",   ring: "oklch(0.55 0.14 245)",  soft: "oklch(0.97 0.03 245)", edge: "oklch(0.55 0.15 245)" },
  { key: "amber",   ring: "oklch(0.68 0.15 60)",   soft: "oklch(0.97 0.04 60)",  edge: "oklch(0.66 0.15 60)"  },
  { key: "rose",    ring: "oklch(0.62 0.16 20)",   soft: "oklch(0.97 0.03 20)",  edge: "oklch(0.62 0.16 20)"  },
  { key: "violet",  ring: "oklch(0.58 0.16 300)",  soft: "oklch(0.97 0.03 300)", edge: "oklch(0.58 0.16 300)" },
] as const;

export function phasePalette(index: number) {
  return STUDIO_PHASE_PALETTE[index % STUDIO_PHASE_PALETTE.length];
}

export function computeStudioLayout(
  phases: RoadmapPhase[],
  milestones: RoadmapMilestoneView[],
  override?: Record<string, StudioPosition>,
): StudioComputedLayout {
  const L = STUDIO_LAYOUT;
  const positions: Record<string, StudioPosition> = {};
  const phaseOrder = phases.map((p) => p.key);
  const milestonesByPhase: Record<string, string[]> = {};

  // Point A on the left
  const pointAId = "point-a";
  positions[pointAId] = override?.[pointAId] ?? {
    x: L.originX,
    y: L.laneTop + L.laneHeaderH,
  };

  // Phase columns + milestone cards
  let colX = L.originX + L.pointW + L.colGapX;
  let deepestY = L.laneTop;
  for (const phase of phases) {
    const ids = milestones
      .filter((m) => phase.milestone_ids.includes(m.id))
      .map((m) => m.id);
    milestonesByPhase[phase.key] = ids;

    positions[`phase:${phase.key}`] = override?.[`phase:${phase.key}`] ?? {
      x: colX,
      y: L.laneTop,
    };

    let cardY = L.laneTop + L.laneHeaderH;
    for (const id of ids) {
      positions[id] = override?.[id] ?? { x: colX, y: cardY };
      cardY += L.cardH + L.cardGapY;
    }
    if (cardY > deepestY) deepestY = cardY;
    colX += L.colW;
  }

  const pointBId = "point-b";
  positions[pointBId] = override?.[pointBId] ?? {
    x: colX,
    y: L.laneTop + L.laneHeaderH,
  };

  return {
    positions,
    phaseOrder,
    milestonesByPhase,
    pointAId,
    pointBId,
    laneBottom: Math.max(deepestY, L.laneTop + L.laneHeaderH + L.cardH),
    canvasRight: colX + L.pointW,
  };
}
