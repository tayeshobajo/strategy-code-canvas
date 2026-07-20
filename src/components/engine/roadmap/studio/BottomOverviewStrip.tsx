import type { RoadmapMilestoneView, RoadmapPhase } from "@/lib/roadmap-view";
import { phasePalette } from "@/lib/roadmap-studio-layout";

export function BottomOverviewStrip({
  phases,
  milestones,
  selectedId,
  onSelect,
  pointALabel,
  pointBLabel,
}: {
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  pointALabel: string;
  pointBLabel: string;
}) {
  const chips: Array<{ id: string; label: string; phaseIndex: number | null }> = [];
  chips.push({ id: "point-a", label: pointALabel, phaseIndex: null });
  phases.forEach((phase, pi) => {
    for (const mid of phase.milestone_ids) {
      const m = milestones.find((x) => x.id === mid);
      if (!m) continue;
      chips.push({ id: m.id, label: m.name, phaseIndex: pi });
    }
  });
  chips.push({ id: "point-b", label: pointBLabel, phaseIndex: null });

  return (
    <footer className="h-[76px] shrink-0 overflow-x-auto border-t border-rule bg-white">
      <div className="flex h-full items-center gap-2 px-4">
        {chips.map((c, i) => {
          const palette = c.phaseIndex !== null ? phasePalette(c.phaseIndex) : null;
          const isPoint = c.id === "point-a" || c.id === "point-b";
          const selected = selectedId === c.id;
          return (
            <div key={c.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-ink/25">›</span>}
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`min-w-[92px] max-w-[160px] truncate rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                  selected ? "border-ink bg-ink/5" : "border-rule bg-white hover:border-ink/30"
                } ${isPoint ? "bg-ink text-white hover:bg-ink" : ""}`}
                style={palette && !isPoint ? { borderLeftColor: palette.ring, borderLeftWidth: 3 } : undefined}
                title={c.label}
              >
                <div className={`text-[9px] font-mono uppercase tracking-wider ${isPoint ? "text-white/60" : "text-ink/45"}`}>
                  {c.id === "point-a" ? "A" : c.id === "point-b" ? "B" : `M ${i}`}
                </div>
                <div className={`truncate font-medium ${isPoint ? "text-white" : "text-ink"}`}>{c.label}</div>
              </button>
            </div>
          );
        })}
      </div>
    </footer>
  );
}
