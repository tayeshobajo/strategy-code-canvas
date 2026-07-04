import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { MilestoneNode } from "./MilestoneNode";
import { MarkerClusterChip } from "./MarkerCluster";
import { MapPin, Flag } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useRoadmapCanvas } from "./canvas-context";
import {
  computeMapLayout,
  clusterMarkers,
  POINT_A_POS,
  POINT_B_POS,
  type MarkerPos,
  type MarkerCluster as MarkerClusterModel,
} from "./roadmap-layout";
import { computeMarkerVisibility, type RoadmapViewMode } from "./view-mode";
import { measure } from "./perf";
import mapBg from "@/assets/roadmap-map-background.png.asset.json";

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1050;
const DRAWER_WIDTH = 410;

/** Route path colors — warm golden-white to read as a sunlit road on terrain. */
const ROUTE_GOLD = "240,210,130"; // #F0D282 warm gold
const ROUTE_GOLD_BRIGHT = "255,235,180"; // lighter highlight

/**
 * Scale a normalized-space SVG path "d" (values in 0..1) into canvas-space.
 * Only rescales numeric coordinates; command letters (M/C/Q/T/L/...) pass through.
 */
function scalePathD(d: string, w: number, h: number): string {
  const tokens = d.split(/(\s+|,)/);
  let numIdx = 0;
  return tokens
    .map((tok) => {
      if (/^-?\d*\.?\d+(?:e-?\d+)?$/.test(tok)) {
        const n = parseFloat(tok);
        const scaled = numIdx % 2 === 0 ? n * w : n * h;
        numIdx++;
        return String(Math.round(scaled * 100) / 100);
      }
      // A letter command resets the alternating x/y counter for its next runs
      // — but for M/L/C/Q/T/S sequences x/y alternation is preserved across
      // whitespace, and our generator only emits M and C, so we don't reset.
      return tok;
    })
    .join("");
}


type Props = {
  journey: RoadmapJourney;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  viewMode: RoadmapViewMode;
  fitHeight?: boolean;
  className?: string;
};

export function MapCanvas({
  journey,
  selectedSlug,
  onSelect,
  viewMode,
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

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    canvas.registerScroller(el);
    const publish = () => {
      measure("viewport:publish", () => {
        canvas.setScrollState({
          scrollWidth: el.scrollWidth,
          scrollLeft: el.scrollLeft,
          clientWidth: el.clientWidth,
        });
        if (el.scrollWidth <= el.clientWidth + 2) {
          canvas.setViewportPhaseKey(null);
          return;
        }
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
              : (band?.key ?? null);
        canvas.setViewportPhaseKey(key);
      });
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
      } catch {}
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

  const visibilities = useMemo(() => {
    return measure("markers:visibility", () => {
      const map = new Map<string, ReturnType<typeof computeMarkerVisibility>>();
      for (const { milestone } of layout.markers) {
        map.set(
          milestone.slug,
          computeMarkerVisibility(milestone, {
            mode: viewMode,
            zoom: canvas.zoomLevel,
            journey,
            currentPhaseKey: canvas.currentPhaseKey ?? journey.currentPhaseKey,
            selectedPhaseKey: canvas.selectedPhaseKey,
            visibleKinds: canvas.visibleKinds,
            mutedKinds: canvas.mutedKinds,
            selectedSlug,
          }),
        );
      }
      return map;
    });
  }, [layout.markers, viewMode, canvas.zoomLevel, canvas.currentPhaseKey, canvas.selectedPhaseKey, canvas.visibleKinds, canvas.mutedKinds, journey, selectedSlug]);

  const keepFull = useMemo(() => {
    const set = new Set<string>();
    if (journey.activeMilestone) set.add(journey.activeMilestone.slug);
    if (journey.nextDecisionSlug) set.add(journey.nextDecisionSlug);
    if (journey.nextDeadlineSlug) set.add(journey.nextDeadlineSlug);
    if (selectedSlug) set.add(selectedSlug);
    return set;
  }, [journey, selectedSlug]);

  const clusterThreshold = canvas.zoomLevel === "strategic" ? 0.05 : canvas.zoomLevel === "phase" ? 0.03 : 0;

  const clustered = useMemo(() => {
    const visibleMarkers = layout.markers.filter(
      (m) => visibilities.get(m.milestone.slug) !== "hidden",
    );
    return clusterMarkers(visibleMarkers, { thresholdNx: clusterThreshold, keepFull });
  }, [layout.markers, visibilities, clusterThreshold, keepFull]);

  type FannedEntry =
    | { kind: "cluster"; cluster: MarkerClusterModel }
    | { kind: "marker"; pos: MarkerPos; overrideX?: number; overrideY?: number; fannedFrom?: string };
  const rendered = useMemo<FannedEntry[]>(() => {
    return measure("cluster:relayout", () => {
      const out: FannedEntry[] = [];
      for (const entry of clustered) {
        if (entry.kind === "cluster" && canvas.explodedClusterKeys.has(entry.cluster.key)) {
          const cx = entry.cluster.nx * CANVAS_WIDTH;
          const cy = entry.cluster.ny * CANVAS_HEIGHT;
          const n = entry.cluster.members.length;
          const spanPx = Math.min(360, 90 + n * 46);
          const step = n > 1 ? spanPx / (n - 1) : 0;
          const startX = cx - spanPx / 2;
          for (let i = 0; i < n; i++) {
            const member = entry.cluster.members[i];
            const dx = startX + i * step - cx;
            const t = n > 1 ? i / (n - 1) - 0.5 : 0;
            const dy = -60 + Math.abs(t) * 120;
            out.push({ kind: "marker", pos: member, overrideX: cx + dx, overrideY: cy + dy, fannedFrom: entry.cluster.key });
          }
          out.push({ kind: "cluster", cluster: entry.cluster });
        } else if (entry.kind === "cluster") {
          out.push({ kind: "cluster", cluster: entry.cluster });
        } else {
          out.push({ kind: "marker", pos: entry.pos });
        }
      }
      return out;
    });
  }, [clustered, canvas.explodedClusterKeys]);

  useEffect(() => {
    if (!selectedSlug) return;
    const marker = layout.markers.find((m) => m.milestone.slug === selectedSlug);
    if (!marker) return;
    const el = scrollRef.current;
    if (!el) return;
    const targetX = marker.nx * el.scrollWidth;
    canvas.scrollToXWithDrawer(targetX, DRAWER_WIDTH);
  }, [selectedSlug, layout.markers, canvas]);

  const bgUrl = mapBg.url;

  const outerClass = fitHeight
    ? "relative h-full w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-royal"
    : "relative w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-royal";

  const scaledWidth = fitHeight ? CANVAS_WIDTH * scale : CANVAS_WIDTH;
  const scaledHeight = fitHeight ? CANVAS_HEIGHT * scale : CANVAS_HEIGHT;

  const currentPhaseKey = canvas.currentPhaseKey ?? journey.currentPhaseKey;
  const selectedPhaseKey = canvas.selectedPhaseKey;

  // Smooth spine: normalized "d" from the layout engine, projected to canvas
  // space. This replaces the old zig-zag polyline through markers.
  const spineD = useMemo(() => {
    return scalePathD(layout.spineD, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [layout.spineD]);

  const phaseSegmentDs = useMemo(() => {
    return layout.spineSegments.map((seg) => ({
      key: seg.key,
      d: scalePathD(seg.d, CANVAS_WIDTH, CANVAS_HEIGHT),
    }));
  }, [layout.spineSegments]);

  // Selected critical path overlay
  const selectedPathPoints = useMemo(() => {
    if (!selectedSlug || journey.criticalPathSlugs.length < 2) return null;
    const pts = journey.criticalPathSlugs
      .map((slug) => layout.markers.find((m) => m.milestone.slug === slug))
      .filter((m): m is (typeof layout.markers)[number] => !!m)
      .map((m) => `${m.nx * CANVAS_WIDTH},${m.ny * CANVAS_HEIGHT}`)
      .join(" ");
    return pts || null;
  }, [selectedSlug, journey.criticalPathSlugs, layout.markers]);


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
      <div className="relative" style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}>
        <div
          className="absolute top-0 left-0"
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            transform: fitHeight ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {/* Terrain background */}
          <img
            src={bgUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={{ filter: "brightness(1.05) saturate(1.1) contrast(1.03)" }}
          />

          {/* Warm golden overlay */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(200,170,100,0.08) 0%, rgba(200,170,100,0) 40%, rgba(100,140,200,0.05) 100%)",
            }}
          />

          {/* === PHASE TERRITORY OVERLAYS (task 5) === */}
          {layout.bands.map((band, i) => {
            const phase = journey.phases[i];
            if (!phase) return null;
            const isCurrent = phase.key === currentPhaseKey;
            const isSelected = selectedPhaseKey === phase.key;
            const isDimmed = selectedPhaseKey !== null && !isSelected && !isCurrent;
            const x0 = band.x0 * CANVAS_WIDTH;
            const x1 = band.x1 * CANVAS_WIDTH;
            const w = x1 - x0;
            return (
              <div
                key={`territory-${phase.key}`}
                aria-hidden="true"
                className="absolute pointer-events-none transition-opacity duration-300"
                style={{
                  left: `${x0}px`,
                  top: 0,
                  width: `${w}px`,
                  height: `${CANVAS_HEIGHT}px`,
                  opacity: isDimmed ? 0.5 : 1,
                  background: isSelected
                    ? "linear-gradient(180deg, rgba(47,93,246,0.06) 0%, rgba(47,93,246,0.02) 50%, rgba(47,93,246,0.06) 100%)"
                    : isCurrent
                      ? "linear-gradient(180deg, rgba(240,210,130,0.05) 0%, rgba(240,210,130,0.02) 50%, rgba(240,210,130,0.05) 100%)"
                      : "transparent",
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                }}
              />
            );
          })}

          {/* Atmospheric vignette — subtle dark edges */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 90% 80% at 50% 45%, rgba(0,0,0,0) 35%, rgba(4,8,20,0.25) 80%, rgba(2,5,12,0.5) 100%)",
            }}
          />

          {/* Top fade for label legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-48 pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(4,10,25,0.35) 0%, rgba(4,10,25,0) 100%)" }}
          />

          {/* Bottom warm haze for depth */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-72 pointer-events-none"
            style={{ background: "linear-gradient(0deg, rgba(15,10,5,0.3) 0%, rgba(15,10,5,0) 100%)" }}
          />

          {/* === SPINE PATH — smooth Catmull-Rom, phase-aware === */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            style={{ zIndex: 5 }}
          >
            <defs>
              <filter id="base-route-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Wide warm glow underlay for the whole spine */}
            <path
              d={spineD}
              fill="none"
              stroke={`rgba(${ROUTE_GOLD},0.14)`}
              strokeWidth={18}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#base-route-glow)"
            />
            {/* Main golden road — smooth continuous curve */}
            <path
              d={spineD}
              fill="none"
              stroke={`rgba(${ROUTE_GOLD_BRIGHT},0.55)`}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="10 6"
            />
            {/* Per-phase status overlays: completed = solid brighter, current
                = slow shimmer, upcoming = faint dashed. */}
            {phaseSegmentDs.map((seg) => {
              const isCurrent = seg.key === currentPhaseKey;
              const phaseIdx = journey.phases.findIndex((p) => p.key === seg.key);
              const currentIdx = journey.phases.findIndex(
                (p) => p.key === currentPhaseKey,
              );
              const isCompleted = currentIdx >= 0 && phaseIdx < currentIdx;
              if (isCompleted) {
                return (
                  <path
                    key={`seg-${seg.key}`}
                    d={seg.d}
                    fill="none"
                    stroke={`rgba(${ROUTE_GOLD_BRIGHT},0.85)`}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }
              if (isCurrent) {
                return (
                  <g key={`seg-${seg.key}`}>
                    <path
                      d={seg.d}
                      fill="none"
                      stroke={`rgba(${ROUTE_GOLD_BRIGHT},0.9)`}
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#base-route-glow)"
                    />
                    {!reduced && (
                      <path
                        d={seg.d}
                        fill="none"
                        stroke="rgba(255,250,235,0.85)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray="14 26"
                        className="roadmap-path-shimmer"
                      />
                    )}
                  </g>
                );
              }
              return null;
            })}
          </svg>


          {/* === SELECTED CRITICAL PATH — bright golden glow === */}
          {selectedPathPoints && (
            <svg
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              style={{ zIndex: 8 }}
            >
              <defs>
                <filter id="sel-route-outer" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="8" result="b" />
                  <feMerge><feMergeNode in="b" /></feMerge>
                </filter>
                <filter id="sel-route-inner" x="-10%" y="-10%" width="120%" height="120%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <polyline points={selectedPathPoints} fill="none" stroke={`rgba(${ROUTE_GOLD},0.4)`} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" filter="url(#sel-route-outer)" />
              <polyline points={selectedPathPoints} fill="none" stroke={`rgba(${ROUTE_GOLD_BRIGHT},0.85)`} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" filter="url(#sel-route-inner)" />
              <polyline points={selectedPathPoints} fill="none" stroke="rgba(255,250,240,0.95)" strokeWidth={2.5} strokeDasharray="6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}

          {journey.phases.map((phase, i) => {
            const band = layout.bands[i];
            const x = ((band.x0 + band.x1) / 2) * CANVAS_WIDTH;
            const y = band.headingY * CANVAS_HEIGHT;
            const pct = Math.round(band.completionRatio * 100);
            const isCurrent = phase.key === currentPhaseKey;
            const isViewing = selectedPhaseKey === phase.key;
            const displayLabel =
              phase.label === "Now"
                ? "Foundation"
                : phase.label === "Next"
                  ? "Core Platform Build"
                  : phase.label === "Later"
                    ? "Scale Systems"
                    : phase.label;
            return (
              <button
                type="button"
                key={phase.key}
                data-no-drag
                data-phase-key={phase.key}
                aria-pressed={isViewing}
                aria-label={`Focus phase ${i + 1}: ${displayLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  canvas.setSelectedPhaseKey(isViewing ? null : phase.key);
                }}
                className="absolute -translate-x-1/2 text-white text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-royal rounded-xl"
                style={{ left: `${x}px`, top: `${y}px`, zIndex: 6 }}
              >
                {/* Reading zone scrim — keeps title legible on any terrain */}
                <span
                  aria-hidden
                  className="absolute -inset-x-6 -inset-y-4 rounded-2xl pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(6,10,22,0.62) 0%, rgba(6,10,22,0.28) 55%, rgba(6,10,22,0) 100%)",
                  }}
                />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div
                      className={`font-mono text-[10px] uppercase tracking-[0.32em] ${
                        isCurrent ? "text-royal-glow" : "text-white/85"
                      }`}
                    >
                      Phase {i + 1}
                    </div>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(240,210,130,0.18)] border border-[rgba(240,210,130,0.5)] px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-[0.22em] text-[#f0d282]">
                        <span className="h-1 w-1 rounded-full bg-[#f0d282]" />
                        Current
                      </span>
                    )}
                    {isViewing && !isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-royal/25 border border-royal/60 px-1.5 py-[1px] text-[9px] font-mono uppercase tracking-[0.22em] text-white">
                        <span className="h-1 w-1 rounded-full bg-royal-glow" />
                        Viewing
                      </span>
                    )}
                  </div>
                  <div className="font-display text-2xl mt-1 leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]">
                    {displayLabel}
                  </div>
                  {phase.milestones[0]?.summary && (
                    <div className="text-[12.5px] text-white/90 mt-1 max-w-[220px] leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">
                      {phase.milestones[0].summary}
                    </div>
                  )}
                  <div
                    className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.24em] ${
                      isCurrent
                        ? "bg-[rgba(240,210,130,0.22)] border border-[rgba(240,210,130,0.6)] text-[#fce9c1]"
                        : "bg-slate-900/75 border border-white/25 text-white"
                    }`}
                  >
                    {pct}% complete
                  </div>
                </div>
              </button>
            );
          })}


          {/* Point A */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 text-white pointer-events-none"
            style={{ left: `${POINT_A_POS.nx * CANVAS_WIDTH}px`, top: `${POINT_A_POS.ny * CANVAS_HEIGHT}px`, zIndex: 7 }}
          >
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-slate-900/75 border border-white/30 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="rounded-lg bg-slate-900/75 border border-white/20 backdrop-blur px-3 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/75">Point A</div>
              <div className="font-display text-[15px] leading-tight">Current State</div>
              <div className="text-[11px] text-white/80">Operating today</div>
            </div>
          </div>

          {/* Point B */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 text-white pointer-events-none"
            style={{ left: `${POINT_B_POS.nx * CANVAS_WIDTH}px`, top: `${POINT_B_POS.ny * CANVAS_HEIGHT}px`, zIndex: 7 }}
          >
            <div className="rounded-lg bg-slate-900/75 border border-white/20 backdrop-blur px-3 py-1.5 text-right shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/75">Point B</div>
              <div className="font-display text-[15px] leading-tight">{journey.pointB.label || "Scaled Impact"}</div>
              {journey.pointB.detail && (
                <div className="text-[11px] text-white/80 max-w-[180px]">
                  {journey.pointB.detail.length > 60 ? journey.pointB.detail.slice(0, 60) + "…" : journey.pointB.detail}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-[color:var(--royal,#2f5df6)] text-white shadow-[0_0_28px_rgba(47,93,246,0.6),0_4px_16px_rgba(0,0,0,0.5)]">
              <Flag className="w-4 h-4" />
            </div>
          </div>

          {/* Markers + clusters */}
          {rendered.map((entry, i) => {
            if (entry.kind === "cluster") {
              return (
                <div
                  key={entry.cluster.key}
                  style={{ opacity: ready ? 1 : 0, transition: reduced ? "none" : "opacity 400ms ease-out" }}
                >
                  <MarkerClusterChip
                    cluster={entry.cluster}
                    x={entry.cluster.nx * CANVAS_WIDTH}
                    y={entry.cluster.ny * CANVAS_HEIGHT}
                    selectedSlug={selectedSlug}
                    onOpenMember={(slug) => onSelect(slug)}
                  />
                </div>
              );
            }
            const { pos } = entry;
            const vis = visibilities.get(pos.milestone.slug) ?? "short";
            const mutedBySelection = !!selectedSlug && pos.milestone.slug !== selectedSlug;
            const px = entry.overrideX != null ? entry.overrideX : pos.nx * CANVAS_WIDTH;
            const py = entry.overrideY != null ? entry.overrideY : pos.ny * CANVAS_HEIGHT;
            const keyId = entry.fannedFrom ? `${entry.fannedFrom}:${pos.milestone.slug}:${i}` : pos.milestone.slug;
            return (
              <div
                key={keyId}
                style={{
                  opacity: ready ? 1 : 0,
                  transition: reduced ? "none" : "opacity 400ms ease-out, left 260ms ease-out, top 260ms ease-out",
                  zIndex: entry.fannedFrom ? 12 : undefined,
                }}
              >
                <MilestoneNode
                  milestone={pos.milestone}
                  x={px}
                  y={py}
                  onOpen={() => onSelect(pos.milestone.slug)}
                  isSelected={pos.milestone.slug === selectedSlug}
                  visibility={vis}
                  attachment={pos.attachment}
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
