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
      className="relative overflow-hidden rounded-2xl border border-[#0A0F1F] bg-[#0A0F1F] p-6 text-white shadow-[0_20px_60px_-30px_rgba(10,15,31,0.55)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#3E68B2] opacity-[0.18] blur-3xl"
      />
      <div className="relative mb-5 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-[#34C4EB]">
          <Brain className="h-4 w-4" />
        </div>
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-[#34C4EB]">
            Captain Intelligence
          </div>
          <h2
            id="captain-intelligence-heading"
            className="mt-1 text-[22px] leading-tight tracking-[-0.01em] text-white"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Tai's current read on this project
          </h2>
        </div>
      </div>
      <ul className="relative space-y-5">
        {items.map((it, idx) => (
          <li
            key={it.label}
            className={idx > 0 ? "border-t border-white/[0.08] pt-5" : ""}
          >
            <div className="flex gap-3.5">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[#34C4EB]">
                {it.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#8fa3c9]">
                  {it.label}
                </div>
                <div className="mt-1 text-[14px] leading-[1.6] text-white/90">
                  {it.body}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
