import { useEffect, useRef, useState } from "react";
import type {
  RoadmapJourney,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import { MilestoneNode } from "./MilestoneNode";
import { Flag, MapPin } from "lucide-react";

type Props = {
  journey: RoadmapJourney;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

// Canvas geometry. Wide enough to feel like a real horizontal journey; the
// container scrolls horizontally on narrower viewports.
const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 460;
const PADDING_X = 120;
const BASE_Y = CANVAS_HEIGHT / 2 + 30;

/**
 * Build a smooth left-to-right route with gentle waves. Milestones are placed
 * along the path at even x positions with a small vertical undulation so nodes
 * don't collide and the road reads as a journey rather than a timeline bar.
 */
function computeLayout(
  journey: RoadmapJourney,
): {
  pathD: string;
  progressPathD: string;
  nodes: Array<{ milestone: RoadmapMilestone; x: number; y: number }>;
  phaseBands: Array<{ key: string; label: string; timeframe: string; x0: number; x1: number }>;
  progressX: number;
} {
  const flat = journey.milestones;
  const usable = CANVAS_WIDTH - PADDING_X * 2;
  const step = usable / Math.max(flat.length + 1, 2);

  const nodes = flat.map((m, i) => {
    const x = PADDING_X + step * (i + 1);
    // Undulate the road: alternating small offsets around BASE_Y.
    const wave = Math.sin((i / Math.max(flat.length - 1, 1)) * Math.PI * 1.6) * 60;
    const y = BASE_Y - wave;
    return { milestone: m, x, y };
  });

  // Smooth cubic path through all node points, anchored at Point A / B.
  const anchorA = { x: PADDING_X * 0.55, y: BASE_Y + 30 };
  const anchorB = { x: CANVAS_WIDTH - PADDING_X * 0.55, y: BASE_Y - 40 };
  const points = [anchorA, ...nodes.map((n) => ({ x: n.x, y: n.y })), anchorB];

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const cx = (prev.x + cur.x) / 2;
    d += ` Q ${cx} ${prev.y}, ${cx} ${(prev.y + cur.y) / 2} T ${cur.x} ${cur.y}`;
  }

  // Progress path: same path clipped to the current progress ratio.
  const progressX = anchorA.x + (anchorB.x - anchorA.x) * (journey.progressPercent / 100);

  // Phase bands: distribute across canvas evenly (3 bands).
  const bandWidth = usable / 3;
  const phaseBands = journey.phases.map((p, i) => ({
    key: p.key,
    label: p.label,
    timeframe: p.timeframe,
    x0: PADDING_X + bandWidth * i,
    x1: PADDING_X + bandWidth * (i + 1),
  }));

  return { pathD: d, progressPathD: d, nodes, phaseBands, progressX };
}

export function JourneyCanvas({ journey, selectedSlug, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startScroll: number } | null>(null);
  const [pathDrawn, setPathDrawn] = useState(false);

  const layout = computeLayout(journey);

  useEffect(() => {
    // Trigger the load-in path animation on mount.
    const t = setTimeout(() => setPathDrawn(true), 100);
    return () => clearTimeout(t);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    const el = scrollRef.current;
    if (!st || !el) return;
    el.scrollLeft = st.startScroll - (e.clientX - st.startX);
  };
  const endDrag = (e: React.PointerEvent) => {
    dragState.current = null;
    const el = scrollRef.current;
    if (el) {
      el.style.cursor = "grab";
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  // Arrow-key navigation between milestone nodes. Focus follows selection so
  // screen readers announce the active milestone; Enter/Space opens details.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-milestone-node]"),
    );
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex(
      (n) => n === document.activeElement,
    );
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : Math.min(Math.max(currentIndex + delta, 0), nodes.length - 1);
      const target = nodes[nextIndex];
      target.focus();
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes[nodes.length - 1].focus();
    }
  };

  return (
    <div
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="Roadmap journey. Use arrow keys to move between milestones, Enter to open details."
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
        {/* Subtle terrain contour lines */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        >
          <defs>
            <linearGradient id="road-base" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
            </linearGradient>
            <linearGradient id="road-progress" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--royal)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--royal-soft)" stopOpacity="0.95" />
            </linearGradient>
            <clipPath id="progress-clip">
              <rect
                x={0}
                y={0}
                width={layout.progressX}
                height={CANVAS_HEIGHT}
              />
            </clipPath>
          </defs>

          {/* Contour bands for depth */}
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

          {/* Base route */}
          <path
            d={layout.pathD}
            fill="none"
            stroke="url(#road-base)"
            strokeWidth={6}
            strokeLinecap="round"
            style={{
              strokeDasharray: pathDrawn ? "none" : "3000",
              strokeDashoffset: pathDrawn ? 0 : 3000,
              transition: "stroke-dashoffset 900ms ease-out",
            }}
          />
          {/* Progress route */}
          <g clipPath="url(#progress-clip)">
            <path
              d={layout.pathD}
              fill="none"
              stroke="url(#road-progress)"
              strokeWidth={7}
              strokeLinecap="round"
              style={{
                filter:
                  "drop-shadow(0 0 12px color-mix(in oklch, var(--royal) 45%, transparent))",
                strokeDasharray: pathDrawn ? "none" : "3000",
                strokeDashoffset: pathDrawn ? 0 : 3000,
                transition: "stroke-dashoffset 1200ms ease-out 200ms",
              }}
            />
          </g>
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

        {/* Milestone nodes */}
        {layout.nodes.map((n, i) => (
          <div
            key={n.milestone.slug}
            style={{
              opacity: pathDrawn ? 1 : 0,
              transition: `opacity 300ms ease-out ${400 + i * 70}ms`,
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
    </div>
  );
}
