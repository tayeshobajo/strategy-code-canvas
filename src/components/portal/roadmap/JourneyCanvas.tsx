import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  RoadmapJourney,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import { MilestoneNode } from "./MilestoneNode";
import { Flag, MapPin } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  journey: RoadmapJourney;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** When set, milestones not in this set are dimmed (view filter active). */
  matchingSlugs?: Set<string> | null;
};

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 460;
const PADDING_X = 120;
const BASE_Y = CANVAS_HEIGHT / 2 + 30;

type LaidOutNode = { milestone: RoadmapMilestone; x: number; y: number };

/** Build the SVG path between two points using a smooth curve. */
function segmentPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const cx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} Q ${cx} ${a.y}, ${cx} ${(a.y + b.y) / 2} T ${b.x} ${b.y}`;
}

function computeLayout(journey: RoadmapJourney) {
  const flat = journey.milestones;
  const usable = CANVAS_WIDTH - PADDING_X * 2;
  const step = usable / Math.max(flat.length + 1, 2);

  const nodes: LaidOutNode[] = flat.map((m, i) => {
    const x = PADDING_X + step * (i + 1);
    const wave = Math.sin((i / Math.max(flat.length - 1, 1)) * Math.PI * 1.6) * 60;
    return { milestone: m, x, y: BASE_Y - wave };
  });

  const anchorA = { x: PADDING_X * 0.55, y: BASE_Y + 30 };
  const anchorB = { x: CANVAS_WIDTH - PADDING_X * 0.55, y: BASE_Y - 40 };
  const points = [anchorA, ...nodes.map((n) => ({ x: n.x, y: n.y })), anchorB];

  // Per-segment paths so we can style completed / active / upcoming / blocked
  // independently and highlight a segment adjacent to a hovered node.
  const segments = points.slice(0, -1).map((p, i) => {
    const q = points[i + 1];
    // The "phase" of a segment is the phase of its right-hand node (if any).
    // Anchor segments inherit from the closest node.
    const rightNode = i < nodes.length ? nodes[i] : nodes[nodes.length - 1];
    const leftNode = i > 0 ? nodes[i - 1] : nodes[0];
    return {
      i,
      d: segmentPath(p, q),
      rightSlug: rightNode?.milestone.slug,
      leftSlug: leftNode?.milestone.slug,
      status: rightNode?.milestone.status ?? "upcoming",
    };
  });

  const bandWidth = usable / 3;
  const phaseBands = journey.phases.map((p, i) => ({
    key: p.key,
    label: p.label,
    timeframe: p.timeframe,
    x0: PADDING_X + bandWidth * i,
    x1: PADDING_X + bandWidth * (i + 1),
  }));

  return { nodes, segments, phaseBands, anchorA, anchorB };
}

export function JourneyCanvas({ journey, selectedSlug, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startScroll: number;
    lastX: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const momentumRaf = useRef<number | null>(null);
  const [pathDrawn, setPathDrawn] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const reduced = useReducedMotion();
  const canvas = useRoadmapCanvas();

  const layout = useMemo(() => computeLayout(journey), [journey]);

  // Register scroller and publish scroll state to context.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    canvas.registerScroller(el);
    const publish = () => {
      canvas.setScrollState({
        scrollWidth: el.scrollWidth,
        scrollLeft: el.scrollLeft,
        clientWidth: el.clientWidth,
      });
      // Active phase = whichever phase band overlaps the viewport center.
      const centerX =
        (el.scrollLeft + el.clientWidth / 2) *
        (CANVAS_WIDTH / Math.max(el.scrollWidth, 1));
      const band = layout.phaseBands.find(
        (b) => centerX >= b.x0 && centerX < b.x1,
      );
      const key =
        centerX <= layout.phaseBands[0].x0
          ? "pointA"
          : centerX >= layout.phaseBands[layout.phaseBands.length - 1].x1
            ? "pointB"
            : (band?.key ?? null);
      canvas.setActivePhaseKey(key);
    };
    publish();
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        publish();
      });
      if (showHint) setShowHint(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => publish());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canvas, layout, showHint]);

  useEffect(() => {
    if (reduced) {
      setPathDrawn(true);
      return;
    }
    const t = setTimeout(() => setPathDrawn(true), 100);
    return () => clearTimeout(t);
  }, [reduced]);

  // Trackpad + Shift+wheel horizontal scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const canScrollX = el.scrollWidth > el.clientWidth;
      if (!canScrollX) return;
      const preferX =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (preferX) {
        const dx = e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)
          ? e.deltaY
          : e.deltaX || e.deltaY;
        el.scrollLeft += dx;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const stopMomentum = () => {
    if (momentumRaf.current) cancelAnimationFrame(momentumRaf.current);
    momentumRaf.current = null;
  };

  const startMomentum = (velocity: number) => {
    if (reduced || Math.abs(velocity) < 0.15) return;
    const el = scrollRef.current;
    if (!el) return;
    let v = velocity;
    const decel = 0.94;
    const tick = () => {
      el.scrollLeft -= v * 16;
      v *= decel;
      if (Math.abs(v) < 0.05) {
        stopMomentum();
        return;
      }
      momentumRaf.current = requestAnimationFrame(tick);
    };
    stopMomentum();
    momentumRaf.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (
      (e.target as HTMLElement).closest(
        "button, a, [role='slider'], [data-no-drag]",
      )
    )
      return;
    const el = scrollRef.current;
    if (!el) return;
    stopMomentum();
    dragState.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    const el = scrollRef.current;
    if (!st || !el) return;
    const now = performance.now();
    const dt = Math.max(1, now - st.lastT);
    st.velocity = (e.clientX - st.lastX) / dt; // px/ms
    st.lastX = e.clientX;
    st.lastT = now;
    const dx = e.clientX - st.startX;
    if (Math.abs(dx) > 3) st.moved = true;
    el.scrollLeft = st.startScroll - dx;
  };
  const endDrag = (e: React.PointerEvent) => {
    const st = dragState.current;
    const el = scrollRef.current;
    dragState.current = null;
    if (el) {
      el.style.cursor = "grab";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (st && st.moved) startMomentum(st.velocity);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-milestone-node]"),
    );
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex((n) => n === document.activeElement);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : Math.min(Math.max(currentIndex + delta, 0), nodes.length - 1);
      const target = nodes[nextIndex];
      target.focus();
      target.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0].focus();
      nodes[0].scrollIntoView({ inline: "center", block: "nearest" });
    } else if (e.key === "End") {
      e.preventDefault();
      const last = nodes[nodes.length - 1];
      last.focus();
      last.scrollIntoView({ inline: "center", block: "nearest" });
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      container.scrollBy({
        left: (e.key === "PageDown" ? 1 : -1) * container.clientWidth * 0.9,
        behavior: reduced ? "auto" : "smooth",
      });
    }
  };

  const activePhase =
    journey.activeMilestone?.phase ?? null;
  const activeBand = activePhase
    ? layout.phaseBands.find((b) => b.key === activePhase)
    : null;
  const activeNode = journey.activeMilestone
    ? layout.nodes.find((n) => n.milestone.slug === journey.activeMilestone!.slug)
    : null;

  return (
    <div
      ref={scrollRef}
      id="portal-canvas-scroll"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="Roadmap journey. Use arrow keys to move between milestones, Enter to open details, Page Up/Down for phases."
      tabIndex={0}
      className="relative w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-paper-soft"
      style={{
        cursor: "grab",
        background:
          "radial-gradient(ellipse at 20% 30%, color-mix(in oklch, var(--royal) 22%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 85% 70%, color-mix(in oklch, var(--royal-soft) 18%, transparent) 0%, transparent 55%), linear-gradient(180deg, oklch(0.18 0.05 265) 0%, oklch(0.12 0.05 265) 100%)",
      }}
    >
      <div
        className="relative"
        style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }}
      >
        {/* Terrain contour lines + phase bands + route */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        >
          <defs>
            <linearGradient id="road-progress" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--royal)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--royal-soft)" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {[0.12, 0.24, 0.38].map((r, i) => (
            <ellipse
              key={i}
              cx={CANVAS_WIDTH * 0.5}
              cy={CANVAS_HEIGHT + 60}
              rx={CANVAS_WIDTH * (0.65 + r)}
              ry={80 + i * 25}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
          ))}

          {/* Active phase glow */}
          {activeBand && (
            <rect
              x={activeBand.x0}
              y={40}
              width={activeBand.x1 - activeBand.x0}
              height={CANVAS_HEIGHT - 80}
              fill="url(#road-progress)"
              opacity={0.06}
              rx={16}
              className={reduced ? undefined : "roadmap-phase-glow"}
            />
          )}

          {/* Phase band separators */}
          {layout.phaseBands.slice(1).map((b) => (
            <line
              key={b.key}
              x1={b.x0}
              x2={b.x0}
              y1={40}
              y2={CANVAS_HEIGHT - 40}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 8"
            />
          ))}

          {/* Route segments — styled per status, with adjacent-segment
              highlight on marker hover/focus. */}
          {layout.segments.map((seg) => {
            const isCompleted = seg.status === "completed";
            const isActive = seg.status === "in_progress";
            const isBlocked = seg.status === "blocked";
            const isHighlighted =
              canvas.highlightedSlug &&
              (seg.rightSlug === canvas.highlightedSlug ||
                seg.leftSlug === canvas.highlightedSlug);
            const stroke = isCompleted
              ? "url(#road-progress)"
              : isActive
                ? "url(#road-progress)"
                : isBlocked
                  ? "rgba(183, 129, 0, 0.6)"
                  : "rgba(255,255,255,0.25)";
            const strokeWidth = isHighlighted ? 8 : isActive ? 7 : 6;
            const drop =
              isCompleted || isActive
                ? "drop-shadow(0 0 12px color-mix(in oklch, var(--royal) 45%, transparent))"
                : "none";
            return (
              <path
                key={seg.i}
                d={seg.d}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className={
                  isActive && !reduced ? "roadmap-active-segment" : undefined
                }
                style={{
                  filter: drop,
                  transition: reduced
                    ? "none"
                    : "stroke-width 200ms ease-out, opacity 400ms ease-out",
                  strokeDasharray: pathDrawn ? "none" : "3000",
                  strokeDashoffset: pathDrawn ? 0 : 3000,
                }}
              />
            );
          })}
        </svg>

        {/* Phase labels */}
        {layout.phaseBands.map((b) => (
          <div
            key={b.key}
            className="absolute top-6"
            style={{ left: `${b.x0 + 20}px` }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/50">
              {b.timeframe}
            </div>
            <div className="font-display text-xl text-white/90 mt-1">
              Phase {b.label}
            </div>
          </div>
        ))}

        {/* Point A */}
        <div
          className="absolute -translate-y-1/2 flex items-center gap-3"
          style={{ left: `${PADDING_X * 0.35}px`, top: `${BASE_Y + 30}px` }}
        >
          <div className="flex items-center justify-center h-11 w-11 rounded-full bg-white/10 border border-white/25 text-white">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="text-white">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/60">
              Point A
            </div>
            <div className="font-display text-lg leading-tight">
              {journey.pointA.label}
            </div>
          </div>
        </div>

        {/* Point B */}
        <div
          className="absolute -translate-y-1/2 flex items-center gap-3"
          style={{
            right: `${PADDING_X * 0.15}px`,
            top: `${BASE_Y - 40}px`,
          }}
        >
          <div className="text-white text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/60">
              Point B
            </div>
            <div className="font-display text-lg leading-tight">
              {journey.pointB.label}
            </div>
          </div>
          <div className="flex items-center justify-center h-11 w-11 rounded-full bg-royal text-white shadow-[0_0_24px_color-mix(in_oklch,var(--royal)_55%,transparent)]">
            <Flag className="w-5 h-5" />
          </div>
        </div>

        {/* "You are here" pill above the active milestone */}
        {activeNode && (
          <div
            className="absolute -translate-x-1/2 pointer-events-none"
            style={{
              left: `${activeNode.x}px`,
              top: `${activeNode.y - 58}px`,
            }}
          >
            <div className="rounded-full bg-white text-royal border border-royal/40 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.24em] whitespace-nowrap">
              You are here
            </div>
          </div>
        )}

        {/* Milestone nodes */}
        {layout.nodes.map((n, i) => (
          <div
            key={n.milestone.slug}
            style={{
              opacity: pathDrawn ? 1 : 0,
              transition: reduced
                ? "none"
                : `opacity 300ms ease-out ${400 + i * 70}ms`,
            }}
          >
            <MilestoneNode
              milestone={n.milestone}
              x={n.x}
              y={n.y}
              isSelected={n.milestone.slug === selectedSlug}
              onOpen={() => onSelect(n.milestone.slug)}
            />
          </div>
        ))}
      </div>

      {/* Right-edge fade + drag hint */}
      {showHint && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 flex items-center justify-end pr-3"
          style={{
            background:
              "linear-gradient(to left, rgba(15,20,45,0.55), transparent)",
            transition: "opacity 400ms ease-out",
          }}
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/70 whitespace-nowrap">
            Drag to explore →
          </div>
        </div>
      )}
    </div>
  );
}
