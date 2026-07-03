import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";
import { Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

type Props = {
  journey: RoadmapJourney;
  onJump: (key: "pointA" | "now" | "next" | "later" | "pointB") => void;
  onFullscreen?: () => void;
  /** "floating" renders as a dark, glass-blur strip designed to sit
   *  absolutely inside the map canvas. Default is the light card variant. */
  variant?: "card" | "floating";
};

export function RoadmapOverviewStrip({ journey, onJump, variant = "card" }: Props) {
  const canvas = useRoadmapCanvas();
  const [expanded, setExpanded] = useState(true);
  const active = canvas.activePhaseKey ?? journey.activeMilestone?.phase ?? "now";

  const phases = journey.phases;
  const floating = variant === "floating";

  return (
    <div
      className={
        floating
          ? "rounded-xl bg-slate-950/75 backdrop-blur border border-white/15 px-4 py-2.5 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.6)] text-white"
          : "rounded-2xl bg-card border border-border p-4 lg:p-5"
      }
    >

      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal">
            Roadmap overview
          </div>
          <div className="text-[12px] text-ink/60 mt-0.5 max-w-[180px] leading-snug">
            Drag or click on the map to navigate
          </div>
        </div>

        {expanded && (
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <StripStop
              label="Point A"
              sub="Current State"
              tone="anchor"
              active={active === "pointA"}
              onClick={() => onJump("pointA")}
            />
            {phases.map((p, i) => (
              <StripStop
                key={p.key}
                label={`Phase ${i + 1}`}
                sub={
                  p.key === "now"
                    ? "Foundation"
                    : p.key === "next"
                      ? "Core Platform Build"
                      : "Scale Systems"
                }
                tone={p.key === "now" ? "phase1" : p.key === "next" ? "phase2" : "phase3"}
                active={active === p.key}
                onClick={() => onJump(p.key as "now" | "next" | "later")}
              />
            ))}
            <StripStop
              label="Point B"
              sub="Scaled Impact"
              tone="anchor"
              active={active === "pointB"}
              onClick={() => onJump("pointB")}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            aria-label={expanded ? "Collapse overview" : "Expand overview"}
          >
            {expanded ? (
              <ChevronLeft className="w-4 h-4 text-ink/70" />
            ) : (
              <ChevronRight className="w-4 h-4 text-ink/70" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof document !== "undefined") {
                const el = document.getElementById("portal-canvas-scroll");
                if (el && el.requestFullscreen) {
                  el.requestFullscreen().catch(() => {});
                }
              }
            }}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            aria-label="View map fullscreen"
          >
            <Maximize2 className="w-4 h-4 text-ink/70" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StripStop({
  label,
  sub,
  tone,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  tone: "anchor" | "phase1" | "phase2" | "phase3";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "phase1"
      ? "text-royal"
      : tone === "phase2"
        ? "text-[#c8811b]"
        : tone === "phase3"
          ? "text-[#3d8558]"
          : "text-ink/60";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? "bg-royal/10 border border-royal/40"
          : "border border-transparent hover:bg-ink/[0.03]"
      }`}
    >
      <div
        className={`font-mono text-[9.5px] uppercase tracking-[0.24em] ${toneClass}`}
      >
        {label}
      </div>
      <div className="text-[12px] font-medium text-ink truncate">{sub}</div>
    </button>
  );
}

export function MapLegend() {
  const items: Array<{ label: string; color: string }> = [
    { label: "Milestone", color: "bg-[color:var(--royal,#2f5df6)]" },
    { label: "Decision", color: "bg-[#8b5cf6]" },
    { label: "Deliverable", color: "bg-[#f59e0b]" },
    { label: "Meeting", color: "bg-[#0ea5a4]" },
    { label: "Deadline", color: "bg-[#e11d48]" },
  ];
  return (
    <div className="inline-flex items-center gap-4 rounded-full bg-slate-900/70 backdrop-blur border border-white/15 px-4 py-2 text-white">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${it.color}`}
            aria-hidden="true"
          />
          <span className="text-[11.5px] font-medium">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
