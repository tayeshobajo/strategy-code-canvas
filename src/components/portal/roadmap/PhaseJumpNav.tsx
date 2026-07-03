import type { RoadmapJourney } from "@/lib/portal-roadmap-model";

type Props = {
  journey: RoadmapJourney;
  onJump: (target: "pointA" | "pointB" | string) => void;
  activeKey: string | null;
};

export function PhaseJumpNav({ journey, onJump, activeKey }: Props) {
  const items = [
    { key: "pointA", label: "Point A", sub: journey.pointA.label },
    ...journey.phases.map((p) => ({
      key: p.key,
      label: `Phase ${p.label}`,
      sub: p.timeframe,
    })),
    { key: "pointB", label: "Point B", sub: journey.pointB.label },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mb-2">
      {items.map((it) => {
        const active = activeKey === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onJump(it.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-left transition-all ${
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
