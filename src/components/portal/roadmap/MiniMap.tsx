import { useEffect, useMemo, useRef } from "react";
import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  journey: RoadmapJourney;
  /** Actual full width of the underlying canvas in px. */
  canvasWidth: number;
};

const MINI_HEIGHT = 72;
const MINI_PADDING = 8;

/**
 * Miniature journey overview. Renders a slim horizontal strip with:
 *  - dots for each milestone
 *  - phase tick separators
 *  - a viewport rectangle showing the currently-visible slice of the main
 *    canvas. Draggable + clickable to pan.
 */
export function MiniMap({ journey, canvasWidth }: Props) {
  const canvas = useRoadmapCanvas();
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startClientX: number; startOffsetX: number } | null>(
    null,
  );

  const positions = useMemo(() => {
    const usable = canvasWidth || 1800;
    const step = usable / (journey.milestones.length + 1);
    return journey.milestones.map((m, i) => ({
      slug: m.slug,
      phase: m.phase,
      status: m.status,
      xRatio: (step * (i + 1)) / usable,
    }));
  }, [journey.milestones, canvasWidth]);

  const phaseTicks = useMemo(
    () =>
      journey.phases.map((p, i) => ({
        key: p.key,
        label: p.label,
        ratio: (i + 0.5) / journey.phases.length,
        edge: i / journey.phases.length,
      })),
    [journey.phases],
  );

  // Viewport rectangle geometry as ratios of the mini strip inner width.
  const viewportRatio = canvas.scrollWidth > 0
    ? Math.min(1, canvas.clientWidth / canvas.scrollWidth)
    : 1;
  const viewportOffsetRatio = canvas.scrollWidth > canvas.clientWidth
    ? canvas.scrollLeft / (canvas.scrollWidth - canvas.clientWidth)
    : 0;

  // The rect can move across (1 - viewportRatio) of the strip.
  const usableRatio = 1 - viewportRatio;

  const stripInnerWidth = () => {
    const el = stripRef.current;
    if (!el) return 0;
    return el.clientWidth - MINI_PADDING * 2;
  };

  const centerMainOnRatio = (r: number) => {
    if (canvas.scrollWidth <= canvas.clientWidth) return;
    const clamped = Math.max(0, Math.min(1, r));
    const target = clamped * (canvas.scrollWidth - canvas.clientWidth);
    canvas.scrollToX(target + canvas.clientWidth / 2);
  };

  const onStripPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-viewport-rect]")) return;
    const el = stripRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - MINI_PADDING;
    const r = x / stripInnerWidth();
    centerMainOnRatio(r);
  };

  const onRectPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = {
      startClientX: e.clientX,
      startOffsetX: viewportOffsetRatio * usableRatio * stripInnerWidth(),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onRectPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startClientX;
    const inner = stripInnerWidth();
    const usableWidth = usableRatio * inner;
    if (usableWidth <= 0) return;
    const nextOffset = st.startOffsetX + dx;
    const r = nextOffset / usableWidth;
    const target =
      Math.max(0, Math.min(1, r)) *
      (canvas.scrollWidth - canvas.clientWidth);
    const scroller = document.getElementById("portal-canvas-scroll");
    if (scroller) scroller.scrollLeft = target;
  };
  const onRectPointerEnd = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    // No-op — reserved for future keyboard nav on the mini-map.
  }, []);

  return (
    <div
      className="rounded-xl border border-border bg-card px-3 py-2"
      aria-label="Roadmap overview"
      role="group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal">
          Overview
        </div>
        <div className="text-[10px] text-ink/50">
          Drag the highlighted area to pan the canvas
        </div>
      </div>
      <div
        ref={stripRef}
        onPointerDown={onStripPointerDown}
        className="relative rounded-md bg-ink/[0.04] cursor-pointer select-none"
        style={{ height: MINI_HEIGHT }}
      >
        <div
          className="absolute inset-y-2"
          style={{ left: MINI_PADDING, right: MINI_PADDING }}
        >
          {/* Route baseline */}
          <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-ink/15 rounded-full" />
          <div
            className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-royal rounded-full"
            style={{ width: `${journey.progressPercent}%` }}
          />
          {/* Phase tick separators */}
          {phaseTicks.slice(1).map((t) => (
            <div
              key={`sep-${t.key}`}
              className="absolute top-0 bottom-0 w-px bg-ink/10"
              style={{ left: `${t.edge * 100}%` }}
            />
          ))}
          {/* Phase labels */}
          {phaseTicks.map((t) => (
            <div
              key={`lbl-${t.key}`}
              className="absolute -top-1 text-[9px] font-mono uppercase tracking-[0.2em] text-ink/45"
              style={{
                left: `${t.ratio * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {t.label}
            </div>
          ))}
          {/* Milestone dots */}
          {positions.map((p) => (
            <div
              key={p.slug}
              className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                p.status === "completed"
                  ? "bg-royal"
                  : p.status === "in_progress"
                    ? "bg-royal ring-2 ring-royal/25"
                    : p.status === "blocked"
                      ? "bg-[#a4283c]"
                      : "bg-ink/35"
              }`}
              style={{ left: `${p.xRatio * 100}%` }}
              title={p.slug}
            />
          ))}
          {/* Viewport rectangle */}
          <div
            data-viewport-rect
            onPointerDown={onRectPointerDown}
            onPointerMove={onRectPointerMove}
            onPointerUp={onRectPointerEnd}
            onPointerCancel={onRectPointerEnd}
            role="slider"
            aria-label="Visible canvas region"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(viewportOffsetRatio * 100)}
            className="absolute inset-y-0 rounded-md border-2 border-royal/70 bg-royal/10 cursor-grab active:cursor-grabbing"
            style={{
              width: `${viewportRatio * 100}%`,
              transform: `translateX(${viewportOffsetRatio * usableRatio * 100 * (1 / Math.max(viewportRatio, 0.0001))}%)`,
              // Simpler: translate by offset in strip-units.
              left: `${viewportOffsetRatio * usableRatio * 100}%`,
              // Reset the transform trick (we use `left` instead):
              // Note: keeping transform empty via inline resolves conflicts.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...({} as any),
            }}
          />
        </div>
      </div>
    </div>
  );
}
