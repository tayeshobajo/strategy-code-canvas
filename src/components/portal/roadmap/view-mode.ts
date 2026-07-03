import type { RoadmapJourney, RoadmapMilestone } from "@/lib/portal-roadmap-model";

export type RoadmapViewMode =
  | "all"
  | "decisions"
  | "deliverables"
  | "deadlines"
  | "current";

export const VIEW_MODE_LABEL: Record<RoadmapViewMode, string> = {
  all: "Full journey",
  decisions: "Decisions only",
  deliverables: "Deliverables only",
  deadlines: "Deadlines only",
  current: "Current phase",
};

export function matchesView(
  m: RoadmapMilestone,
  mode: RoadmapViewMode,
  journey: RoadmapJourney,
): boolean {
  switch (mode) {
    case "all":
      return true;
    case "decisions":
      return m.kind === "decision";
    case "deliverables":
      return m.kind === "deliverable";
    case "deadlines":
      return !!(m.dueDate || m.targetDate);
    case "current": {
      const activePhase = journey.activeMilestone?.phase;
      return activePhase ? m.phase === activePhase : true;
    }
  }
}

/** Compute the set of milestone slugs that match the current view mode. */
export function computeMatchingSlugs(
  journey: RoadmapJourney,
  mode: RoadmapViewMode,
): Set<string> {
  const set = new Set<string>();
  for (const m of journey.milestones) {
    if (matchesView(m, mode, journey)) set.add(m.slug);
  }
  return set;
}
