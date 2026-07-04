import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ChevronDown, ChevronUp, Calendar, CircleDot, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type {
  PhaseKey,
  RoadmapJourney,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";
import type { RoadmapViewMode } from "./view-mode";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import pointAAsset from "@/assets/minimap/point-a.png.asset.json";
import pointBAsset from "@/assets/minimap/point-b.png.asset.json";

type JumpTarget = "pointA" | "pointB" | PhaseKey;

type Props = {
  journey: RoadmapJourney;
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
  onJump: (target: JumpTarget) => void;
  onFullscreen?: () => void;
  viewMode?: RoadmapViewMode;
  matchingSlugs?: Set<string> | null;
};

/** Ordered palette for phase colors — cycles when there are more than 3 phases. */
const PHASE_COLORS = [
  "#2F7DFF", // Phase 1 — royal blue
  "#F59D2A", // Phase 2 — amber
  "#7DCA54", // Phase 3 — green
  "#8B5CF6", // Phase 4 — violet
  "#0EA5A4", // Phase 5 — teal
];

/** Kind color for milestone dots — matches the main canvas legend. */
const KIND_COLOR: Record<string, string> = {
  milestone: "#2F7DFF",
  decision: "#8B5CF6",
  deliverable: "#F59D2A",
  meeting: "#0EA5A4",
  deadline: "#E11D48",
};

function phaseColor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length];
}

function phaseLabel(index: number): string {
  return `Phase ${index + 1}`;
}

function phaseSubtitle(p: RoadmapJourney["phases"][number]): string {
  // Prefer summary, fall back to timeframe.
  return p.summary?.trim() || p.timeframe || p.label;
}

/** Effective kind — deadlines are milestones with a dueDate. */
function effectiveKind(m: RoadmapMilestone): string {
  if (m.dueDate && m.kind === "milestone") return "deadline";
  return m.kind;
}

/** Priority score (lower = more important) for dot selection. */
function dotPriority(
  m: RoadmapMilestone,
  ctx: { selectedSlug: string | null; activeSlug: string | null; criticalSet: Set<string> },
): number {
  if (ctx.selectedSlug && m.slug === ctx.selectedSlug) return 0;
  if (ctx.activeSlug && m.slug === ctx.activeSlug) return 1;
  if (m.status === "blocked" && m.kind === "decision") return 2;
  if (m.dueDate) return 3;
  if (ctx.criticalSet.has(m.slug)) return 4;
  if (m.kind === "deliverable") return 5;
  if (m.kind === "meeting") return 6;
  return 7;
}

function phaseCompletion(p: RoadmapJourney["phases"][number]): number {
  const real = p.milestones.filter((m) => !m.slug.endsWith("-placeholder"));
  if (real.length === 0) return 0;
  const done = real.filter((m) => m.status === "completed").length;
  const inProg = real.filter((m) => m.status === "in_progress").length;
  return Math.round(((done + inProg * 0.5) / real.length) * 100);
}

export function RoadmapOverviewMiniMap({
  journey,
  selectedSlug = null,
  onSelect,
  onJump,
  onFullscreen,
  viewMode = "all",
  matchingSlugs = null,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const canvas = useRoadmapCanvas();

  const currentKey: PhaseKey =
    (canvas.currentPhaseKey as PhaseKey | null) ?? journey.currentPhaseKey;
  const selectedKey: PhaseKey | null =
    (canvas.selectedPhaseKey as PhaseKey | null) ??
    (canvas.viewportPhaseKey as PhaseKey | null);

  const criticalSet = useMemo(
    () => new Set(journey.criticalPathSlugs),
    [journey.criticalPathSlugs],
  );

  const activeSlug = journey.activeMilestone?.slug ?? null;

  const currentPhaseIndex = journey.phases.findIndex((p) => p.key === currentKey);
  const selectedPhaseIndex = selectedKey
    ? journey.phases.findIndex((p) => p.key === selectedKey)
    : -1;

  const maxDotsPerPhase = journey.phases.length > 4 ? 4 : 6;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const isHoveringRef = useRef(false);

  // Keyboard navigation: ←/→ move between phases when the panel is hovered or focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isHoveringRef.current && !rootRef.current?.contains(document.activeElement)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const phases = journey.phases;
      if (!phases.length) return;
      const currentIdx = selectedKey
        ? phases.findIndex((p) => p.key === selectedKey)
        : phases.findIndex((p) => p.key === currentKey);
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(phases.length - 1, (currentIdx < 0 ? 0 : currentIdx) + delta));
      if (nextIdx === currentIdx) return;
      e.preventDefault();
      handlePhaseClick(phases[nextIdx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.phases, selectedKey, currentKey]);


  const handlePhaseClick = (phase: RoadmapJourney["phases"][number]) => {
    canvas.setSelectedPhaseKey(phase.key);
    onJump(phase.key);
    if (onSelect) {
      const inPhase = phase.milestones.filter(
        (m) => !m.slug.endsWith("-placeholder"),
      );
      const pick =
        inPhase.find((m) => m.status === "in_progress") ??
        inPhase.find((m) => m.status === "upcoming") ??
        inPhase[0];
      if (pick) onSelect(pick.slug);
    }
  };

  const handleAnchorClick = (which: "pointA" | "pointB") => {
    canvas.setSelectedPhaseKey(null);
    onJump(which);
  };

  const currentPhaseLabel =
    currentPhaseIndex >= 0 ? phaseLabel(currentPhaseIndex) : "—";
  const viewingPhaseLabel =
    selectedPhaseIndex >= 0 && selectedPhaseIndex !== currentPhaseIndex
      ? phaseLabel(selectedPhaseIndex)
      : null;

  // Live announcement for screen readers when the viewing phase changes.
  const [announcement, setAnnouncement] = useState<string>("");
  useEffect(() => {
    if (selectedPhaseIndex < 0) {
      setAnnouncement("");
      return;
    }
    const p = journey.phases[selectedPhaseIndex];
    if (!p) return;
    const real = p.milestones.filter((m) => !m.slug.endsWith("-placeholder"));
    const done = real.filter((m) => m.status === "completed").length;
    setAnnouncement(
      `Viewing ${phaseLabel(selectedPhaseIndex)}: ${p.summary?.trim() || p.label}. ${done} of ${real.length} milestones complete.`,
    );
  }, [selectedPhaseIndex, journey.phases]);


  return (
    <div
      ref={rootRef}
      onMouseEnter={() => { isHoveringRef.current = true; }}
      onMouseLeave={() => { isHoveringRef.current = false; }}
      className="rounded-2xl border text-white overflow-hidden"

      style={{
        background: "rgba(3,10,24,0.88)",
        backdropFilter: "blur(18px)",
        borderColor: "rgba(140,170,220,0.24)",
        boxShadow:
          "0 20px 60px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      data-testid="roadmap-overview-mini-map"
    >
      <div className="flex items-stretch gap-4 px-4 py-3">
        {/* LEFT — label + state */}
        <div className="shrink-0 self-center min-w-[150px] max-w-[170px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/85">
            Roadmap overview
          </div>
          <div className="mt-0.5 text-[11px] text-white/55 leading-snug">
            Click a phase to navigate
          </div>
          <div className="mt-1.5 text-[11px] leading-snug space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    currentPhaseIndex >= 0
                      ? phaseColor(currentPhaseIndex)
                      : "#2F7DFF",
                  boxShadow: `0 0 6px ${
                    currentPhaseIndex >= 0
                      ? phaseColor(currentPhaseIndex)
                      : "#2F7DFF"
                  }`,
                }}
                aria-hidden
              />
              <span className="text-white/60">Current:</span>
              <span className="text-white">{currentPhaseLabel}</span>
            </div>
            {viewingPhaseLabel && (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full ring-2"
                  style={{
                    background: "#2F7DFF",
                    boxShadow: "0 0 0 2px rgba(47,125,255,0.25)",
                  }}
                  aria-hidden
                />
                <span className="text-white/60">Viewing:</span>
                <span className="text-white">{viewingPhaseLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* CENTER — the mini-map itself */}
        {expanded && (
          <div className="relative flex-1 min-w-0 flex items-stretch gap-1 h-[104px]">
            {/* Continuous soft route glow across the whole strip */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-[76px] right-[76px] top-1/2 -translate-y-1/2 h-[2px] rounded-full opacity-70"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(47,125,255,0.55) 25%, rgba(245,157,42,0.55) 55%, rgba(125,202,84,0.55) 85%, rgba(255,255,255,0.15) 100%)",
                boxShadow: "0 0 12px rgba(47,125,255,0.25)",
              }}
            />

            {/* Point A vignette */}
            <AnchorTile
              side="left"
              label="Point A"
              sub={journey.pointA.label}
              imageUrl={pointAAsset.url}
              active={!selectedKey && (canvas.viewportPhaseKey as string | null) === null}
              onClick={() => handleAnchorClick("pointA")}
            />

            {/* Phase segments */}
            {journey.phases.map((p, i) => {
              const color = phaseColor(i);
              const isCurrent = i === currentPhaseIndex;
              const isSelected = i === selectedPhaseIndex;
              return (
                <PhaseSegment
                  key={p.key}
                  index={i}
                  totalPhases={journey.phases.length}
                  phase={p}
                  color={color}
                  label={phaseLabel(i)}
                  subtitle={phaseSubtitle(p)}
                  isCurrent={isCurrent}
                  isSelected={isSelected}
                  completion={phaseCompletion(p)}
                  maxDots={maxDotsPerPhase}
                  selectedSlug={selectedSlug}
                  activeSlug={activeSlug}
                  criticalSet={criticalSet}
                  matchingSlugs={matchingSlugs}
                  viewMode={viewMode}
                  onPhaseClick={() => handlePhaseClick(p)}
                  onDotClick={(slug) => {
                    if (onSelect) onSelect(slug);
                  }}
                />
              );
            })}

            {/* Point B vignette */}
            <AnchorTile
              side="right"
              label="Point B"
              sub={journey.pointB.label}
              imageUrl={pointBAsset.url}
              active={false}
              onClick={() => handleAnchorClick("pointB")}
            />
          </div>
        )}

        {/* RIGHT — controls */}
        <div className="shrink-0 self-center flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (onFullscreen) return onFullscreen();
              const el = document.getElementById("portal-canvas-scroll");
              if (el) el.scrollTo({ left: 0, behavior: "smooth" });
              canvas.setSelectedPhaseKey(null);
            }}
            aria-label="Fit map to field"
            title="Fit to field"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7DFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030A18]"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white/85" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse overview" : "Expand overview"}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7DFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030A18]"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-white/85" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-white/85" />
            )}
          </button>
        </div>
      </div>
      {/* Screen-reader-only live region — announces phase changes */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </div>

  );
}

/* ------------------------------------------------------------------------ */

function AnchorTile({
  side,
  label,
  sub,
  imageUrl,
  active,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  sub: string;
  imageUrl: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — ${sub}`}
      className={`relative shrink-0 w-[72px] rounded-lg overflow-hidden text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7DFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030A18] ${
        active
          ? "border border-[#2F7DFF]/60"
          : "border border-transparent hover:border-white/15"
      }`}
      style={{
        background:
          side === "left"
            ? "radial-gradient(120% 100% at 30% 100%, rgba(47,125,255,0.18) 0%, rgba(3,10,24,0) 65%)"
            : "radial-gradient(120% 100% at 70% 100%, rgba(255,220,140,0.14) 0%, rgba(3,10,24,0) 65%)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[78%] bg-no-repeat bg-bottom"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "contain",
          opacity: 0.9,
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)",
          WebkitMaskImage:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)",
        }}
      />
      <div className="relative px-1.5 pt-1.5">
        <div className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-white/75 leading-none">
          {label}
        </div>
        <div className="text-[10px] text-white/85 leading-tight mt-0.5 truncate">
          {sub}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------------ */

function PhaseSegment({
  index,
  totalPhases,
  phase,
  color,
  label,
  subtitle,
  isCurrent,
  isSelected,
  completion,
  maxDots,
  selectedSlug,
  activeSlug,
  criticalSet,
  matchingSlugs,
  viewMode,
  onPhaseClick,
  onDotClick,
}: {
  index: number;
  totalPhases: number;
  phase: RoadmapJourney["phases"][number];
  color: string;
  label: string;
  subtitle: string;
  isCurrent: boolean;
  isSelected: boolean;
  completion: number;
  maxDots: number;
  selectedSlug: string | null;
  activeSlug: string | null;
  criticalSet: Set<string>;
  matchingSlugs: Set<string> | null;
  viewMode: RoadmapViewMode;
  onPhaseClick: () => void;
  onDotClick: (slug: string) => void;
}) {
  const compact = totalPhases > 4;
  const realMilestones = useMemo(
    () => phase.milestones.filter((m) => !m.slug.endsWith("-placeholder")),
    [phase.milestones],
  );

  const filtered = useMemo(() => {
    if (!matchingSlugs || viewMode === "all") return realMilestones;
    return realMilestones.filter((m) => matchingSlugs.has(m.slug));
  }, [realMilestones, matchingSlugs, viewMode]);

  const dots = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) =>
        dotPriority(a, { selectedSlug, activeSlug, criticalSet }) -
        dotPriority(b, { selectedSlug, activeSlug, criticalSet }),
    );
    const shown = sorted.slice(0, maxDots);
    const overflow = Math.max(0, sorted.length - shown.length);
    // Preserve sequence order for the shown dots so they read left-to-right.
    const shownSequenced = filtered.filter((m) =>
      shown.some((s) => s.slug === m.slug),
    );
    return { shown: shownSequenced, overflow };
  }, [filtered, selectedSlug, activeSlug, criticalSet, maxDots]);

  const itemCount = realMilestones.length;
  const primaryNext =
    realMilestones.find((m) => m.status === "in_progress") ??
    realMilestones.find((m) => m.status === "upcoming");

  const tooltip = `${label} · ${subtitle}\n${completion}% complete · ${itemCount} item${
    itemCount === 1 ? "" : "s"
  }${primaryNext ? ` · Next: ${primaryNext.title}` : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPhaseClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPhaseClick();
        }
      }}
      aria-label={`${label}, ${completion}% complete, ${itemCount} item${
        itemCount === 1 ? "" : "s"
      }${isCurrent ? ", current phase" : ""}${isSelected ? ", viewing" : ""}`}
      aria-pressed={isSelected}
      title={tooltip}
      className="group relative flex-1 min-w-0 rounded-lg cursor-pointer transition-all duration-[240ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7DFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030A18]"
      style={{
        border: isSelected ? `1px solid ${color}` : "1px solid transparent",
        background: isSelected
          ? `linear-gradient(180deg, ${withAlpha(color, 0.22)} 0%, ${withAlpha(
              color,
              0.08,
            )} 100%)`
          : `linear-gradient(180deg, ${withAlpha(color, 0.06)} 0%, rgba(3,10,24,0) 100%)`,
        boxShadow: isSelected
          ? `0 0 24px ${withAlpha(color, 0.35)}, inset 0 0 16px ${withAlpha(
              color,
              0.15,
            )}`
          : undefined,
      }}
    >
      {/* Title band */}
      <div className="px-2 pt-1.5">
        <div
          className={`font-mono ${compact ? "text-[8.5px]" : "text-[9.5px]"} uppercase tracking-[0.22em] flex items-center gap-1`}
          style={{ color }}
        >
          <span>{label}</span>
          {isCurrent && (
            <span
              className="inline-block h-1 w-1 rounded-full"
              style={{ background: color, boxShadow: `0 0 5px ${color}` }}
              aria-label="current phase"
            />
          )}
        </div>
        <div
          className={`${compact ? "text-[10px]" : "text-[11px]"} font-medium truncate mt-0.5 leading-tight text-white/90`}
        >
          {subtitle}
        </div>
      </div>

      {/* Route line + dots */}
      <div className="absolute left-2 right-2 top-1/2 mt-3 h-[32px]">
        {/* Untraveled base track — dim, dashed */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${withAlpha(color, 0.35)} 0 4px, transparent 4px 8px)`,
            opacity: 0.55,
          }}
        />
        {/* Traveled progress — solid, glowing, animates to completion */}
        <div
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full transition-[width] duration-[600ms] ease-out"
          style={{
            width: `${Math.max(2, completion)}%`,
            background: `linear-gradient(90deg, ${withAlpha(color, 0.6)} 0%, ${color} 60%, #FFD37A 100%)`,
            boxShadow: `0 0 10px ${withAlpha(color, isSelected ? 0.75 : 0.5)}, 0 0 2px #FFD37A`,
            opacity: isSelected ? 1 : 0.9,
          }}
        />
        {/* "You are here" beacon on the current phase, at completion % */}
        {isCurrent && (
          <div
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center"
            style={{ left: `${Math.min(98, Math.max(2, completion))}%` }}
          >
            <span
              className="absolute h-4 w-4 rounded-full animate-ping"
              style={{ background: withAlpha("#FFD37A", 0.55) }}
            />
            <span
              className="relative h-2 w-2 rounded-full"
              style={{
                background: "#FFD37A",
                boxShadow: `0 0 8px #FFD37A, 0 0 16px ${withAlpha(color, 0.6)}`,
                border: "1px solid rgba(255,255,255,0.9)",
              }}
            />
          </div>
        )}


        <div className="relative w-full h-full flex items-center justify-around">
          {dots.shown.map((m) => {
            const isSel = selectedSlug === m.slug;
            const kind = effectiveKind(m);
            const dotColor = KIND_COLOR[kind] ?? color;
            return (
              <button
                key={m.slug}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDotClick(m.slug);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                title={`${m.title}${m.dueDate ? ` · due ${m.dueDate}` : ""}`}
                aria-label={m.title}
                className="relative inline-flex items-center justify-center h-4 w-4 rounded-full transition-transform duration-[160ms] hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-[#030A18]"
              >
                {isSel && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: withAlpha(dotColor, 0.6) }}
                  />
                )}
                <span
                  className="relative rounded-full border"
                  style={{
                    width: isSel ? 9 : 7,
                    height: isSel ? 9 : 7,
                    background: dotColor,
                    borderColor: isSel
                      ? "#fff"
                      : "rgba(255,255,255,0.35)",
                    boxShadow: isSel
                      ? `0 0 10px ${dotColor}`
                      : `0 0 4px ${withAlpha(dotColor, 0.55)}`,
                  }}
                />
              </button>
            );
          })}

          {dots.overflow > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPhaseClick();
              }}
              className="inline-flex items-center justify-center h-4 min-w-[22px] px-1.5 rounded-full text-[9px] font-mono font-medium text-white/85 border transition-colors hover:bg-white/10"
              style={{
                background: withAlpha(color, 0.18),
                borderColor: withAlpha(color, 0.55),
              }}
              title={`${dots.overflow} more milestone${dots.overflow === 1 ? "" : "s"} in ${label}`}
              aria-label={`${dots.overflow} more milestones in ${label}`}
            >
              +{dots.overflow}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/** Turn a hex color into an rgba() string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
