import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { MilestoneNode } from "./MilestoneNode";
import { MapPin, Flag } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useRoadmapCanvas } from "./canvas-context";
import { computeMapLayout, POINT_A_POS, POINT_B_POS } from "./roadmap-layout";
import mapBg from "@/assets/roadmap-map-background.png.asset.json";

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1050; // ~3:2 to match the source photo

type Props = {
  journey: RoadmapJourney;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  matchingSlugs?: Set<string> | null;
  /** When true, the inner canvas is scaled to fit the parent height so the
   *  full map sits inside a controlled app viewport (no page scroll). */
  fitHeight?: boolean;
  className?: string;
};

export function MapCanvas({
  journey,
  selectedSlug,
  onSelect,
  matchingSlugs,
  fitHeight = false,
  className,
}: Props) {
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
  const reduced = useReducedMotion();
  const canvas = useRoadmapCanvas();
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);

  const layout = useMemo(() => computeMapLayout(journey), [journey]);

  // When fitting to height, observe the container and rescale the inner canvas.
  useLayoutEffect(() => {
    if (!fitHeight) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      if (h > 0) setScale(h / CANVAS_HEIGHT);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitHeight]);


  // Publish scroll state so the header pill + overview strip can react.
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
      const centerX =
        (el.scrollLeft + el.clientWidth / 2) *
        (CANVAS_WIDTH / Math.max(el.scrollWidth, 1));
      const cn = centerX / CANVAS_WIDTH;
      const band = layout.bands.find((b) => cn >= b.x0 && cn < b.x1);
      const key =
        cn <= layout.bands[0].x0
          ? "pointA"
          : cn >= layout.bands[layout.bands.length - 1].x1
            ? "pointB"
            : band?.key ?? null;
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
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => publish());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canvas, layout]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Trackpad + Shift+wheel horizontal scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const preferX = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (preferX) {
        el.scrollLeft += e.deltaX || e.deltaY;
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
    const tick = () => {
      el.scrollLeft -= v * 16;
      v *= 0.94;
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
    st.velocity = (e.clientX - st.lastX) / dt;
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
    const idx = nodes.findIndex((n) => n === document.activeElement);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next =
        idx < 0
          ? 0
          : Math.min(
              Math.max(idx + (e.key === "ArrowRight" ? 1 : -1), 0),
              nodes.length - 1,
            );
      nodes[next].focus();
      nodes[next].scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      container.scrollBy({
        left: (e.key === "PageDown" ? 1 : -1) * container.clientWidth * 0.9,
        behavior: reduced ? "auto" : "smooth",
      });
    }
  };

  const bgUrl = mapBg.url;

  const outerClass = fitHeight
    ? "relative h-full w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-royal"
    : "relative w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-royal";

  const scaledWidth = fitHeight ? CANVAS_WIDTH * scale : CANVAS_WIDTH;
  const scaledHeight = fitHeight ? CANVAS_HEIGHT * scale : CANVAS_HEIGHT;

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
      aria-label="Roadmap journey map. Drag to pan, arrow keys to move between milestones."
      tabIndex={0}
      className={`${outerClass}${className ? ` ${className}` : ""}`}
      style={{ cursor: "grab", background: "#0b1220" }}
    >
      <div
        className="relative"
        style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            transform: fitHeight ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        >

        {/* Photorealistic background */}
        <img
          src={bgUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        {/* Subtle top gradient so phase labels stay legible */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(4,10,25,0.55) 0%, rgba(4,10,25,0) 100%)",
          }}
        />

        {/* Phase headings */}
        {journey.phases.map((phase, i) => {
          const band = layout.bands[i];
          const x = ((band.x0 + band.x1) / 2) * CANVAS_WIDTH;
          const y = band.headingY * CANVAS_HEIGHT;
          const pct = Math.round(band.completionRatio * 100);
          return (
            <div
              key={phase.key}
              className="absolute -translate-x-1/2 text-white pointer-events-none"
              style={{ left: `${x}px`, top: `${y}px` }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/70">
                Phase {i + 1}
              </div>
              <div className="font-display text-2xl mt-1 leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]">
                {phase.label === "Now"
                  ? "Foundation"
                  : phase.label === "Next"
                    ? "Core Platform Build"
                    : "Scale Systems"}
              </div>
              {phase.milestones[0]?.summary && (
                <div className="text-[12.5px] text-white/75 mt-1 max-w-[220px] leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]">
                  {phase.milestones[0].summary}
                </div>
              )}
              <div className="mt-2 inline-flex items-center rounded-full bg-white/10 backdrop-blur border border-white/20 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.24em]">
                {pct}% complete
              </div>
            </div>
          );
        })}

        {/* Point A */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 text-white pointer-events-none"
          style={{
            left: `${POINT_A_POS.nx * CANVAS_WIDTH}px`,
            top: `${POINT_A_POS.ny * CANVAS_HEIGHT}px`,
          }}
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-slate-900/70 border border-white/25 backdrop-blur">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="rounded-lg bg-slate-900/70 border border-white/15 backdrop-blur px-3 py-1.5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/60">
              Point A
            </div>
            <div className="font-display text-[15px] leading-tight">
              Current State
            </div>
            <div className="text-[11px] text-white/70">Operating today</div>
          </div>
        </div>

        {/* Point B */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 text-white pointer-events-none"
          style={{
            left: `${POINT_B_POS.nx * CANVAS_WIDTH}px`,
            top: `${POINT_B_POS.ny * CANVAS_HEIGHT}px`,
          }}
        >
          <div className="rounded-lg bg-slate-900/70 border border-white/15 backdrop-blur px-3 py-1.5 text-right">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/60">
              Point B
            </div>
            <div className="font-display text-[15px] leading-tight">
              {journey.pointB.label || "Scaled Impact"}
            </div>
            {journey.pointB.detail && (
              <div className="text-[11px] text-white/70 max-w-[180px]">
                {journey.pointB.detail.length > 60
                  ? journey.pointB.detail.slice(0, 60) + "…"
                  : journey.pointB.detail}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-[color:var(--royal,#2f5df6)] text-white shadow-[0_0_24px_rgba(47,93,246,0.55)]">
            <Flag className="w-4 h-4" />
          </div>
        </div>

        {/* Milestone / decision markers */}
        {layout.markers.map(({ milestone, nx, ny }) => {
          const dimmed = matchingSlugs
            ? !matchingSlugs.has(milestone.slug)
            : false;
          const mutedBySelection =
            !!selectedSlug && milestone.slug !== selectedSlug;
          return (
            <div
              key={milestone.slug}
              style={{
                opacity: ready ? 1 : 0,
                transition: reduced ? "none" : "opacity 400ms ease-out",
              }}
            >
              <MilestoneNode
                milestone={milestone}
                x={nx * CANVAS_WIDTH}
                y={ny * CANVAS_HEIGHT}
                onOpen={() => onSelect(milestone.slug)}
                isSelected={milestone.slug === selectedSlug}
                dimmed={dimmed}
                mutedBySelection={mutedBySelection}
              />
            </div>
          );
        })}

        </div>
      </div>
    </div>
  );
}

