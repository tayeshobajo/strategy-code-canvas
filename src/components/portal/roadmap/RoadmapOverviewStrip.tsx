import type { PhaseKey, RoadmapJourney } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas, useDisplayPhaseKey } from "./canvas-context";
import type { LegendKind } from "./view-mode";
import { Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

type JumpTarget = "pointA" | "now" | "next" | "later" | "pointB";

type Props = {
  journey: RoadmapJourney;
  onJump: (key: JumpTarget) => void;
  onFullscreen?: () => void;
  /** "floating" renders as a dark, glass-blur strip designed to sit
   *  absolutely inside the map canvas. Default is the light card variant. */
  variant?: "card" | "floating";
};

export function RoadmapOverviewStrip({ journey, onJump, variant = "card" }: Props) {
  const [expanded, setExpanded] = useState(true);
  const active = useDisplayPhaseKey() ?? journey.currentPhaseKey;
  const canvas = useRoadmapCanvas();

  const phases = journey.phases;
  const floating = variant === "floating";

  const handleJump = (key: JumpTarget) => {
    // Setting selectedPhaseKey makes the user's choice sticky in the mini-map
    // regardless of what the main viewport ends up centering on.
    if (key === "pointA" || key === "pointB") {
      canvas.setSelectedPhaseKey(null);
    } else {
      canvas.setSelectedPhaseKey(key as PhaseKey);
    }
    onJump(key);
  };

  return (
    <div
      className={
        floating
          ? "rounded-xl bg-slate-950/75 backdrop-blur border border-white/15 px-4 py-2.5 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.6)] text-white"
          : "rounded-2xl bg-card border border-border p-4 lg:p-5"
      }
      data-testid="roadmap-overview-strip"
    >
      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <div
            className={`font-mono text-[10px] uppercase tracking-[0.28em] ${floating ? "text-royal-glow" : "text-royal"}`}
          >
            Roadmap overview
          </div>
          <div
            className={`text-[12px] mt-0.5 max-w-[180px] leading-snug ${floating ? "text-white/65" : "text-ink/60"}`}
          >
            Click a stop to focus the map
          </div>
        </div>

        {expanded && (
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <StripStop
              label="Point A"
              sub="Current State"
              tone="anchor"
              active={active === "pointA"}
              onClick={() => handleJump("pointA")}
              floating={floating}
              testId="strip-pointA"
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
                onClick={() => handleJump(p.key as "now" | "next" | "later")}
                floating={floating}
                current={p.key === journey.currentPhaseKey}
                testId={`strip-${p.key}`}
              />
            ))}
            <StripStop
              label="Point B"
              sub="Scaled Impact"
              tone="anchor"
              active={active === "pointB"}
              onClick={() => handleJump("pointB")}
              floating={floating}
              testId="strip-pointB"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={
              floating
                ? "inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-white"
                : "inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            }
            aria-label={expanded ? "Collapse overview" : "Expand overview"}
          >
            {expanded ? (
              <ChevronLeft className={`w-4 h-4 ${floating ? "text-white" : "text-ink/70"}`} />
            ) : (
              <ChevronRight className={`w-4 h-4 ${floating ? "text-white" : "text-ink/70"}`} />
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
            className={
              floating
                ? "inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-white"
                : "inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            }
            aria-label="View map fullscreen"
          >
            <Maximize2 className={`w-4 h-4 ${floating ? "text-white" : "text-ink/70"}`} />
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
  floating = false,
  current = false,
  testId,
}: {
  label: string;
  sub: string;
  tone: "anchor" | "phase1" | "phase2" | "phase3";
  active: boolean;
  onClick: () => void;
  floating?: boolean;
  current?: boolean;
  testId?: string;
}) {
  const toneClass =
    tone === "phase1"
      ? floating
        ? "text-[#7ea6ff]"
        : "text-royal"
      : tone === "phase2"
        ? floating
          ? "text-[#f0b25b]"
          : "text-[#c8811b]"
        : tone === "phase3"
          ? floating
            ? "text-[#7bd6a0]"
            : "text-[#3d8558]"
          : floating
            ? "text-white/60"
            : "text-ink/60";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      data-current-phase={current ? "true" : "false"}
      className={`flex-1 min-w-0 rounded-lg px-3 py-1.5 text-left transition-colors ${
        active
          ? floating
            ? "bg-white/15 border border-white/40"
            : "bg-royal/10 border border-royal/40"
          : floating
            ? "border border-transparent hover:bg-white/10"
            : "border border-transparent hover:bg-ink/[0.03]"
      }`}
    >
      <div className={`font-mono text-[9.5px] uppercase tracking-[0.24em] ${toneClass}`}>
        {label}
        {current && (
          <span
            className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${floating ? "bg-royal-glow" : "bg-royal"}`}
            aria-label="current phase"
          />
        )}
      </div>
      <div className={`text-[12px] font-medium truncate ${floating ? "text-white" : "text-ink"}`}>
        {sub}
      </div>
    </button>
  );
}

/** Interactive legend — each chip cycles visible → muted → hidden. */
export function MapLegend() {
  const canvas = useRoadmapCanvas();
  const items: Array<{ label: string; color: string; kind: LegendKind }> = [
    { label: "Milestone", color: "bg-[color:var(--royal,#2f5df6)]", kind: "milestone" },
    { label: "Decision", color: "bg-[#8b5cf6]", kind: "decision" },
    { label: "Deliverable", color: "bg-[#f59e0b]", kind: "deliverable" },
    { label: "Meeting", color: "bg-[#0ea5a4]", kind: "meeting" },
    { label: "Deadline", color: "bg-[#e11d48]", kind: "deadline" },
  ];

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full bg-slate-900/70 backdrop-blur border border-white/15 px-2 py-1.5 text-white"
      data-testid="map-legend"
    >
      {items.map((it) => {
        const isVisible = canvas.visibleKinds.has(it.kind);
        const isMuted = canvas.mutedKinds.has(it.kind);
        const state = isVisible ? "visible" : isMuted ? "muted" : "hidden";
        return (
          <button
            key={it.label}
            type="button"
            onClick={() => canvas.toggleKind(it.kind)}
            data-testid={`legend-${it.kind}`}
            data-state={state}
            aria-pressed={isVisible}
            title={
              isVisible
                ? "Click to mute"
                : isMuted
                  ? "Click to hide"
                  : "Click to show"
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              isVisible
                ? "bg-white/10 text-white hover:bg-white/15"
                : isMuted
                  ? "bg-transparent text-white/55 hover:bg-white/5"
                  : "bg-transparent text-white/30 line-through hover:bg-white/5"
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${it.color} ${!isVisible ? "opacity-40" : ""}`}
              aria-hidden="true"
            />
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
