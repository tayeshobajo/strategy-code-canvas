import type { PhaseKey, RoadmapJourney } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas, useDisplayPhaseKey } from "./canvas-context";
import type { LegendKind, RoadmapViewMode } from "./view-mode";
import { VIEW_MODE_LABEL } from "./view-mode";
import { Maximize2, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  computeMapLayout,
  POINT_A_POS,
  POINT_B_POS,
} from "./roadmap-layout";

type JumpTarget = "pointA" | "now" | "next" | "later" | "pointB";

type Props = {
  journey: RoadmapJourney;
  onJump: (key: JumpTarget) => void;
  onFullscreen?: () => void;
  selectedSlug?: string | null;
  viewMode?: RoadmapViewMode;
  matchingSlugs?: Set<string> | null;
  variant?: "card" | "floating";
};

const KIND_DOT: Record<string, string> = {
  milestone: "bg-[color:var(--royal,#2f5df6)]",
  decision: "bg-[#8b5cf6]",
  deliverable: "bg-[#f59e0b]",
  meeting: "bg-[#0ea5a4]",
  deadline: "bg-[#e11d48]",
};

const VIEW_TONE: Record<RoadmapViewMode, { rgb: string; label: string }> = {
  all: { rgb: "47,93,246", label: "Full journey" },
  decisions: { rgb: "139,92,246", label: "Decisions" },
  deliverables: { rgb: "245,158,11", label: "Deliverables" },
  deadlines: { rgb: "225,29,72", label: "Deadlines" },
  current: { rgb: "47,93,246", label: "Current phase" },
  "client-actions": { rgb: "14,165,164", label: "Needs you" },
  "critical-path": { rgb: "245,158,11", label: "Critical path" },
};

export function RoadmapOverviewStrip({
  journey,
  onJump,
  selectedSlug = null,
  viewMode = "all",
  matchingSlugs = null,
  variant = "card",
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const active = useDisplayPhaseKey() ?? journey.currentPhaseKey;
  const canvas = useRoadmapCanvas();
  const layout = useMemo(() => computeMapLayout(journey), [journey]);

  useEffect(() => {
    if (
      canvas.selectedPhaseKey &&
      canvas.viewportPhaseKey &&
      canvas.viewportPhaseKey !== canvas.selectedPhaseKey
    ) {
      canvas.setSelectedPhaseKey(null);
    }
  }, [canvas.viewportPhaseKey, canvas.selectedPhaseKey, canvas]);

  const phases = journey.phases;
  const floating = variant === "floating";
  const tone = VIEW_TONE[viewMode] ?? VIEW_TONE.all;

  const handleJump = (key: JumpTarget) => {
    if (key === "pointA" || key === "pointB") {
      canvas.setSelectedPhaseKey(null);
    } else {
      canvas.setSelectedPhaseKey(key as PhaseKey);
    }
    onJump(key);
  };

  const viewport = useMemo(() => {
    const total = canvas.scrollWidth || 0;
    const view = canvas.clientWidth || 0;
    if (total <= 0 || view <= 0 || view >= total - 2) return null;
    const left = canvas.scrollLeft / total;
    const width = Math.min(1, view / total);
    return { left, width };
  }, [canvas.scrollWidth, canvas.scrollLeft, canvas.clientWidth]);

  const selectedX = useMemo(() => {
    if (!selectedSlug) return null;
    const m = layout.markers.find((mk) => mk.milestone.slug === selectedSlug);
    return m ? m.nx : null;
  }, [layout.markers, selectedSlug]);

  return (
    <div
      className={
        floating
          ? "rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/10 px-3.5 pt-2.5 pb-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] text-white"
          : "rounded-2xl bg-card border border-border p-4 lg:p-5"
      }
      data-testid="roadmap-overview-strip"
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0 min-w-[130px]">
          <div
            className={`font-mono text-[10px] uppercase tracking-[0.28em] ${floating ? "text-royal-glow" : "text-royal"}`}
          >
            Roadmap overview
          </div>
          {(() => {
            const currentKey = canvas.currentPhaseKey ?? journey.currentPhaseKey;
            const selectedKey = canvas.selectedPhaseKey ?? canvas.viewportPhaseKey ?? null;
            const label = (k: string | null | undefined): string => {
              if (k === "now") return "Phase 1";
              if (k === "next") return "Phase 2";
              if (k === "later") return "Phase 3";
              return "";
            };
            const currentLabel = label(currentKey);
            const viewingLabel = label(selectedKey);
            const showViewing = !!selectedKey && selectedKey !== currentKey;
            return (
              <div className={`mt-0.5 text-[11px] leading-snug ${floating ? "text-white/70" : "text-ink/60"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${floating ? "bg-royal-glow" : "bg-royal"}`} aria-hidden />
                  <span>
                    <span className={floating ? "text-white/65" : "text-ink/55"}>Current:</span>{" "}
                    <span className={floating ? "text-white" : "text-ink"}>{currentLabel}</span>
                  </span>
                </div>
                {showViewing && (
                  <div className="flex items-center gap-1.5 mt-0.5" data-testid="strip-viewing-caption">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full ring-2"
                      style={{ background: `rgb(${tone.rgb})`, boxShadow: `0 0 0 2px rgba(${tone.rgb},0.25)` }}
                      aria-hidden
                    />
                    <span>
                      <span className={floating ? "text-white/65" : "text-ink/55"}>Viewing:</span>{" "}
                      <span className={floating ? "text-white" : "text-ink"}>{viewingLabel}</span>
                    </span>
                  </div>
                )}
                {viewMode !== "all" && (
                  <div className={`mt-0.5 text-[10.5px] ${floating ? "text-white/60" : "text-ink/50"}`}>
                    View: {VIEW_MODE_LABEL[viewMode]}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {expanded && (
          <div className="flex-1 min-w-0 relative">
            {/* Route line */}
            <div
              aria-hidden
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2.5px] rounded-full transition-colors duration-300"
              style={{
                background: floating
                  ? `linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(${tone.rgb},0.55) 45%, rgba(${tone.rgb},0.85) 75%, rgba(${tone.rgb},1) 100%)`
                  : `linear-gradient(90deg, rgba(11,18,32,0.12) 0%, rgba(${tone.rgb},0.45) 55%, rgba(${tone.rgb},0.85) 100%)`,
                boxShadow: floating
                  ? `0 0 12px rgba(${tone.rgb},${viewMode === "all" ? 0.3 : 0.5})`
                  : undefined,
              }}
            />
            {viewport && floating && (
              <div
                aria-hidden
                data-testid="mini-viewport-window"
                className="pointer-events-none absolute inset-y-1 rounded-md transition-[left,width,border-color,background-color,box-shadow] duration-200 ease-out"
                style={{
                  left: `${viewport.left * 100}%`,
                  width: `${viewport.width * 100}%`,
                  borderWidth: viewMode === "all" ? 1 : 1.5,
                  borderStyle: "solid",
                  borderColor: `rgba(${tone.rgb},${viewMode === "all" ? 0.6 : 0.85})`,
                  background: `rgba(${tone.rgb},${viewMode === "all" ? 0.1 : 0.18})`,
                  boxShadow: `inset 0 0 16px rgba(${tone.rgb},${viewMode === "all" ? 0.25 : 0.4})`,
                }}
              />
            )}
            {selectedX != null && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 -ml-1.5"
                style={{ left: `${selectedX * 100}%` }}
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inset-0 rounded-full bg-royal opacity-70" />
                  <span className="relative rounded-full h-3 w-3 bg-royal border border-white shadow-[0_0_10px_rgba(47,93,246,0.9)]" />
                </span>
              </span>
            )}

            <div className="relative flex items-stretch gap-0.5">
              <StripStop
                label="Point A"
                sub="Current State"
                tone="anchor"
                active={active === "pointA"}
                onClick={() => handleJump("pointA")}
                floating={floating}
                testId="strip-pointA"
                kindCounts={{}}
                showRoute={false}
              />

              {phases.map((p) => (
                <StripStop
                  key={p.key}
                  label={
                    p.key === "now"
                      ? "Phase 1"
                      : p.key === "next"
                        ? "Phase 2"
                        : "Phase 3"
                  }
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
                  kindCounts={countKinds(p.milestones, matchingSlugs)}
                  showRoute
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
                kindCounts={{}}
                showRoute={false}
              />
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("portal-canvas-scroll");
              if (el) el.scrollTo({ left: 0, behavior: "smooth" });
              canvas.setSelectedPhaseKey(null);
            }}
            className={
              floating
                ? "inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/15 text-white/85"
                : "inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            }
            aria-label="Fit map to field"
            title="Fit to field"
          >
            <Maximize2 className={`w-3.5 h-3.5 ${floating ? "text-white" : "text-ink/70"}`} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={
              floating
                ? "inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/15 text-white/85"
                : "inline-flex items-center justify-center h-8 w-8 rounded-md border border-ink/15 bg-white hover:bg-ink/5"
            }
            aria-label={expanded ? "Collapse overview" : "Expand overview"}
          >
            {expanded ? (
              <ChevronDown className={`w-3.5 h-3.5 ${floating ? "text-white" : "text-ink/70"}`} />
            ) : (
              <ChevronUp className={`w-3.5 h-3.5 ${floating ? "text-white" : "text-ink/70"}`} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function countKinds(
  items: RoadmapJourney["phases"][number]["milestones"],
  matchingSlugs?: Set<string> | null,
) {
  const counts: Record<string, number> = {};
  for (const m of items) {
    if (m.slug.endsWith("-placeholder")) continue;
    if (matchingSlugs && !matchingSlugs.has(m.slug)) continue;
    const key = m.dueDate && m.kind === "milestone" ? "deadline" : m.kind;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
  kindCounts,
  showRoute,
}: {
  label: string;
  sub: string;
  tone: "anchor" | "phase1" | "phase2" | "phase3";
  active: boolean;
  onClick: () => void;
  floating?: boolean;
  current?: boolean;
  testId?: string;
  kindCounts: Record<string, number>;
  showRoute: boolean;
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
            ? "text-white/65"
            : "text-ink/60";
  const activeShellFloating =
    "bg-royal/20 border border-royal/60 shadow-[0_0_0_1px_rgba(47,93,246,0.45),inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_0_16px_rgba(47,93,246,0.25),0_0_20px_rgba(47,93,246,0.15)]";
  const kinds = Object.entries(kindCounts).sort(
    ([a], [b]) => Number(b === "milestone") - Number(a === "milestone"),
  );
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      data-current-phase={current ? "true" : "false"}
      className={`relative flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-left transition-all ${
        active
          ? floating
            ? activeShellFloating
            : "bg-royal/10 border border-royal/40"
          : floating
            ? "border border-transparent hover:bg-white/[0.06]"
            : "border border-transparent hover:bg-ink/[0.03]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className={`absolute -top-[3px] left-1/2 -translate-x-1/2 h-1 w-5 rounded-full ${
            floating ? "bg-royal shadow-[0_0_8px_rgba(47,93,246,0.85)]" : "bg-royal"
          }`}
        />
      )}
      <div
        className={`font-mono text-[9px] uppercase tracking-[0.22em] flex items-center gap-1 ${toneClass}`}
      >
        <span>{label}</span>
        {current && (
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${floating ? "bg-royal-glow" : "bg-royal"}`}
            aria-label="current phase"
          />
        )}
      </div>
      <div
        className={`text-[11px] font-medium truncate mt-0.5 leading-tight ${floating ? (active ? "text-white" : "text-white/85") : "text-ink"}`}
      >
        {sub}
      </div>
      {showRoute && kinds.length > 0 && (
        <div className="mt-1 flex items-center gap-0.5">
          {kinds.slice(0, 5).map(([k, count]) => (
            <span
              key={k}
              className={`inline-block h-1 w-1 rounded-full ${KIND_DOT[k] ?? "bg-white/40"}`}
              title={`${count} ${k}${count === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      )}
    </button>
  );
}

/** Interactive legend */
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
                  ? "bg-transparent text-white/65 hover:bg-white/5"
                  : "bg-transparent text-white/35 line-through hover:bg-white/5"
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

export { POINT_A_POS, POINT_B_POS };
