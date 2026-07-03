import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  journey: RoadmapJourney;
  onJump: (target: "pointA" | "pointB" | string) => void;
};

export function PhaseJumpNav({ journey, onJump }: Props) {
  const canvas = useRoadmapCanvas();
  const items = [
    { key: "pointA", label: "Point A", sub: journey.pointA.label },
    ...journey.phases.map((p) => ({
      key: p.key,
      label: `Phase ${p.label}`,
      sub: p.timeframe,
    })),
    { key: "pointB", label: "Point B", sub: journey.pointB.label },
  ];
  const activeKey = canvas.activePhaseKey;

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 -mb-2"
      role="tablist"
      aria-label="Jump to roadmap phase"
    >
      {items.map((it) => {
        const active = activeKey === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onJump(it.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-paper-soft ${
              active
                ? "bg-ink text-white border-ink"
                : "bg-card text-ink border-border hover:border-ink/40"
            }`}
          >
            <div className="text-[13px] font-medium leading-tight">
              {it.label}
            </div>
            <div
              className={`text-[11px] mt-0.5 ${active ? "text-white/70" : "text-ink/55"}`}
            >
              {it.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
