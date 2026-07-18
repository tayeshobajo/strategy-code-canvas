import type { ReactNode } from "react";
import { Brain, Sparkles, Radar } from "lucide-react";

type Item = { icon: ReactNode; label: string; body: ReactNode };

export function CaptainIntelligencePanel({
  whatChanged,
  whatMatters,
  recommendation,
}: {
  whatChanged: ReactNode;
  whatMatters: ReactNode;
  recommendation: ReactNode;
}) {
  const items: Item[] = [
    { icon: <Radar className="h-4 w-4" />, label: "What changed", body: whatChanged },
    { icon: <Brain className="h-4 w-4" />, label: "What matters now", body: whatMatters },
    { icon: <Sparkles className="h-4 w-4" />, label: "Recommendation", body: recommendation },
  ];
  return (
    <section
      aria-labelledby="captain-intelligence-heading"
      className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-full border border-[#cdd6f3] bg-[#eef3fd] p-1.5 text-[#3E68B2]">
          <Brain className="h-4 w-4" />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Captain Intelligence
          </div>
          <h2
            id="captain-intelligence-heading"
            className="font-display text-base leading-tight text-[#0A0F1F]"
          >
            Tai's current read on this project
          </h2>
        </div>
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.label} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E8E1D6] bg-[#FBF9F4] text-[#3E68B2]">
              {it.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                {it.label}
              </div>
              <div className="mt-0.5 text-sm leading-relaxed text-[#0A0F1F]">{it.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
